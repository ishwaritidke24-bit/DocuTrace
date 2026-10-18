import math
import re
import sys
import uuid

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import pymupdf
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from llm_service import generate_answer
from search_engine import index_chunks, search_chunks


app = FastAPI(title="DocuTrace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB

# Retrieval settings
RETRIEVAL_LIMIT = 8
MAX_SOURCE_PASSAGES = 4

# Provisional threshold based on the scores observed during testing.
# Calibrate this against relevant and irrelevant questions before deployment.
MIN_SIMILARITY_SCORE = 0.08


class QueryRequest(BaseModel):
    document_id: str
    question: str


# ---------------------------------------------------------
# TEXT EXTRACTION AND CHUNKING
# ---------------------------------------------------------

def _split_long_block(text: str, max_chars: int) -> list[str]:
    """Split oversized lines at sentence or word boundaries."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    pieces = []
    current = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        if len(sentence) > max_chars:
            if current:
                pieces.append(current)
                current = ""

            words = sentence.split()
            word_block = ""

            for word in words:
                if len(word) > max_chars:
                    if word_block:
                        pieces.append(word_block)
                        word_block = ""

                    # Extremely long tokens are rare, but avoid infinite loops.
                    for start in range(0, len(word), max_chars):
                        pieces.append(word[start:start + max_chars])

                elif not word_block:
                    word_block = word

                elif len(word_block) + len(word) + 1 <= max_chars:
                    word_block += " " + word

                else:
                    pieces.append(word_block)
                    word_block = word

            if word_block:
                pieces.append(word_block)

        elif not current:
            current = sentence

        elif len(current) + len(sentence) + 1 <= max_chars:
            current += " " + sentence

        else:
            pieces.append(current)
            current = sentence

    if current:
        pieces.append(current)

    return pieces


def _overlap_tail(text: str, overlap: int) -> str:
    """Return a word-aligned trailing overlap from the preceding chunk."""
    if overlap <= 0 or not text:
        return ""

    tail = text[-overlap:]

    # Avoid starting the overlap halfway through a word.
    first_space = tail.find(" ")
    if first_space != -1:
        tail = tail[first_space + 1:]

    return tail.strip()


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 180,
) -> list[str]:
    """
    Create overlapping, paragraph/line-aware chunks.

    The chunker preserves headings and list lines where possible,
    avoids arbitrary character cuts, and joins hyphenated words
    split across PDF line breaks.
    """
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("Invalid chunk size or overlap.")

    if not text or not text.strip():
        return []

    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Repair words split by PDF line wrapping, such as:
    # "authenti-\ncation" -> "authentication"
    text = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "", text)

    lines = [
        re.sub(r"[ \t]+", " ", line).strip()
        for line in text.split("\n")
    ]

    units = []

    for line in lines:
        if not line:
            continue

        units.extend(_split_long_block(line, chunk_size))

    chunks = []
    current = ""

    for unit in units:
        if not current:
            current = unit
            continue

        if len(current) + len(unit) + 1 <= chunk_size:
            current += "\n" + unit
            continue

        chunks.append(current.strip())

        carry = _overlap_tail(current, overlap)

        # Keep the overlap and next unit within the chunk size.
        allowed_overlap = max(0, chunk_size - len(unit) - 1)

        if len(carry) > allowed_overlap:
            carry = _overlap_tail(current, allowed_overlap)

        current = f"{carry}\n{unit}" if carry else unit

    if current.strip():
        chunks.append(current.strip())

    return chunks


# ---------------------------------------------------------
# SEARCH RESULT NORMALIZATION
# ---------------------------------------------------------

def _result_text(result: dict) -> str:
    """Extract the text from common search-result structures."""
    metadata = result.get("metadata") or {}
    payload = result.get("payload") or {}

    return str(
        result.get("text")
        or result.get("content")
        or result.get("page_content")
        or result.get("chunk_text")
        or result.get("passage")
        or metadata.get("text")
        or metadata.get("content")
        or payload.get("text")
        or payload.get("content")
        or ""
    ).strip()


def _normalise_result(result: dict) -> dict | None:
    """Normalize a retriever result while preserving its original fields."""
    if not isinstance(result, dict):
        return None

    text = _result_text(result)

    if not text:
        return None

    metadata = result.get("metadata") or {}
    payload = result.get("payload") or {}

    raw_score = (
        result.get("score")
        if result.get("score") is not None
        else result.get("similarity")
    )

    if raw_score is None:
        raw_score = metadata.get(
            "score",
            payload.get("score"),
        )

    try:
        score = float(raw_score) if raw_score is not None else None
        if score is not None and not math.isfinite(score):
            score = None
    except (TypeError, ValueError):
        score = None

    page = (
        result.get("page")
        or result.get("page_number")
        or metadata.get("page")
        or metadata.get("page_number")
        or payload.get("page")
        or payload.get("page_number")
    )

    chunk = (
        result.get("chunk")
        or result.get("chunk_id")
        or metadata.get("chunk")
        or metadata.get("chunk_id")
        or payload.get("chunk")
        or payload.get("chunk_id")
    )

    normalized = dict(result)
    normalized["text"] = text
    normalized["page"] = page
    normalized["chunk"] = chunk
    normalized["score"] = score

    return normalized


# ---------------------------------------------------------
# QUERY EXPANSION
# ---------------------------------------------------------

def _query_variants(question: str) -> list[str]:
    """
    Create targeted search formulations based on user intent.

    These are additional retrieval queries, not generated answers.
    """
    lower = question.lower()
    variants = [question.strip()]

    purpose_question = bool(
        re.search(
            r"\b(purpose|objective|overview|about|main aim|main idea)\b",
            lower,
        )
    )

    summary_question = bool(
        re.search(
            r"\b(summar|summary|key points|main findings|conclusion)\b",
            lower,
        )
    )

    obligation_question = bool(
        re.search(
            r"\b(obligation|responsibilit|requirement|duties|must|shall)\b",
            lower,
        )
    )

    date_question = bool(
        re.search(
            r"\b(date|deadline|when|expires|expiration|time period)\b",
            lower,
        )
    )

    vulnerability_question = bool(
        re.search(
            r"\b(vulnerabilit|security|severity|attack|impact|root cause)\b",
            lower,
        )
    )

    if purpose_question:
        variants.extend([
            "executive summary purpose objective overview main aim",
            "report title primary finding core issue document overview",
        ])

    if summary_question:
        variants.extend([
            "executive summary key findings main points conclusion",
            "main issue root cause impact and recommendations",
        ])

    if obligation_question:
        variants.extend([
            "obligations responsibilities requirements duties actions required",
            "shall must should required actions commitments and conditions",
        ])

    if date_question:
        variants.extend([
            "dates deadlines effective date expiry and time periods",
        ])

    if vulnerability_question:
        variants.extend([
            "security finding vulnerability severity impact root cause",
            "proof of concept reproduction steps remediation recommendations",
        ])

    # Preserve ordering while removing duplicates.
    return list(dict.fromkeys(
        value.strip()
        for value in variants
        if value and value.strip()
    ))


# ---------------------------------------------------------
# MULTI-QUERY RETRIEVAL AND RE-RANKING
# ---------------------------------------------------------

def retrieve_reranked(
    question: str,
    document_id: str,
    limit: int = RETRIEVAL_LIMIT,
) -> list[dict]:
    """
    Retrieve candidates using several query formulations, merge duplicate
    passages, and rank them using Reciprocal Rank Fusion (RRF).

    This avoids relying entirely on the ranking from one semantic query.
    """
    lower_question = question.lower()

    purpose_question = bool(
        re.search(
            r"\b(purpose|objective|overview|about|main aim|main idea)\b",
            lower_question,
        )
    )

    summary_question = bool(
        re.search(
            r"\b(summar|summary|main findings|key points|conclusion)\b",
            lower_question,
        )
    )

    obligation_question = bool(
        re.search(
            r"\b(obligation|responsibilit|requirement|duties|must|shall)\b",
            lower_question,
        )
    )

    date_question = bool(
        re.search(
            r"\b(date|deadline|when|expires|expiration|time period)\b",
            lower_question,
        )
    )

    stopwords = {
        "the", "and", "for", "that", "this", "with", "from",
        "what", "which", "when", "where", "who", "how", "does",
        "can", "are", "was", "were", "you", "your", "into",
        "about", "have", "has", "its", "document", "please",
        "summarise", "summarize",
    }

    question_words = {
        word
        for word in re.findall(r"[a-z0-9]+", lower_question)
        if len(word) > 2 and word not in stopwords
    }

    candidates = {}

    for query_index, query in enumerate(_query_variants(question)):
        matches = search_chunks(
            question=query,
            document_id=document_id,
            limit=limit,
        )

        seen_in_query = set()

        for rank, raw_result in enumerate(matches or [], start=1):
            result = _normalise_result(raw_result)

            if not result:
                continue

            text = result["text"]
            page = result.get("page")

            normalized_text = re.sub(
                r"\s+",
                " ",
                text,
            ).strip().casefold()

            # Deduplicate overlapping/duplicate retrievals while keeping
            # repeated identical passages on different pages distinct.
            key = f"{page}:{normalized_text}"

            if key in seen_in_query:
                continue

            seen_in_query.add(key)

            if key not in candidates:
                candidates[key] = dict(result)
                candidates[key]["_rrf_score"] = 0.0
                candidates[key]["_best_raw_score"] = result.get("score")

            candidate = candidates[key]

            # Give the original question slightly more influence than
            # its expanded formulations.
            weight = 1.5 if query_index == 0 else 1.0

            candidate["_rrf_score"] += weight / (60 + rank)

            # Keep the best observed raw similarity score for the passage.
            score = result.get("score")
            previous_score = candidate.get("_best_raw_score")

            if score is not None and (
                previous_score is None or score > previous_score
            ):
                candidate["_best_raw_score"] = score
                candidate["score"] = score

    ranked = []

    for result in candidates.values():
        text = result["text"]
        lower_text = text.lower()

        text_words = set(
            re.findall(r"[a-z0-9]+", lower_text)
        )

        lexical_overlap = (
            len(question_words & text_words) / len(question_words)
            if question_words
            else 0.0
        )

        # RRF provides the main ranking signal. Lexical overlap is a
        # small additional signal, not a replacement for semantic search.
        final_score = (
            result["_rrf_score"]
            + 0.02 * lexical_overlap
        )

        # Prefer sections likely to directly answer the specific question.
        if purpose_question and re.search(
            r"executive summary|overview|purpose|objective|"
            r"introduction|report title|security finding|"
            r"primary finding",
            lower_text,
        ):
            final_score += 0.06

        if summary_question and re.search(
            r"executive summary|key findings|main findings|"
            r"conclusion|overview|summary",
            lower_text,
        ):
            final_score += 0.025

        if obligation_question and re.search(
            r"obligation|responsibilit|requirement|must|shall|"
            r"remediation|recommendation|mitigation|action required",
            lower_text,
        ):
            final_score += 0.025

        if date_question and re.search(
            r"\b(20\d{2}|deadline|expires|expiration|effective date|"
            r"within|days|months|years)\b",
            lower_text,
        ):
            final_score += 0.025

        result["retrieval_score"] = final_score
        ranked.append(result)

    ranked.sort(
        key=lambda item: item["retrieval_score"],
        reverse=True,
    )

    # Remove private ranking fields before passing results to other layers.
    cleaned = []

    for result in ranked:
        result = dict(result)
        result.pop("_rrf_score", None)
        result.pop("_best_raw_score", None)
        cleaned.append(result)

    return cleaned[:limit]


# ---------------------------------------------------------
# API ROUTES
# ---------------------------------------------------------

@app.get("/")
def home():
    return {"message": "DocuTrace API is running"}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file.",
        )

    content = await file.read(MAX_PDF_SIZE + 1)

    if len(content) > MAX_PDF_SIZE:
        raise HTTPException(
            status_code=413,
            detail="PDF must be 10 MB or smaller.",
        )

    if b"%PDF-" not in content[:1024]:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid PDF.",
        )

    chunks = []

    try:
        with pymupdf.open(
            stream=content,
            filetype="pdf",
        ) as document:

            for page_number, page in enumerate(document, start=1):
                # sort=True requests text in a more natural reading order.
                page_text = page.get_text(
                    "text",
                    sort=True,
                ).strip()

                if not page_text:
                    continue

                page_chunks = chunk_text(page_text)

                for chunk_number, chunk in enumerate(
                    page_chunks,
                    start=1,
                ):
                    chunks.append({
                        "page": page_number,
                        "chunk": chunk_number,
                        "text": chunk,
                    })

    except Exception as exc:
        print("[DocuTrace] PDF extraction failed:", repr(exc))
        raise HTTPException(
            status_code=400,
            detail="Could not read this PDF.",
        ) from exc

    if not chunks:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found. Scanned PDFs need OCR.",
        )

    document_id = str(uuid.uuid4())

    try:
        indexed_count = index_chunks(chunks, document_id)

    except Exception as exc:
        print("[DocuTrace] Indexing failed:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="Could not index the PDF.",
        ) from exc

    print(
        f"[DocuTrace] Indexed {indexed_count} chunks "
        f"for document {document_id}"
    )

    return {
        "message": "PDF uploaded and indexed successfully",
        "filename": file.filename,
        "document_id": document_id,
        "chunks_indexed": indexed_count,
    }


@app.post("/query")
def query_document(request: QueryRequest):
    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    try:
        results = retrieve_reranked(
            question=question,
            document_id=request.document_id,
            limit=RETRIEVAL_LIMIT,
        )

    except Exception as exc:
        print("[DocuTrace] Document search failed:", repr(exc))
        raise HTTPException(
            status_code=500,
            detail="Document search failed.",
        ) from exc

    clean_q = question.encode("ascii", errors="replace").decode("ascii")
    print(f"\n[DocuTrace] Question: {clean_q}")
    print(f"[DocuTrace] Reranked candidates: {len(results)}")

    for result in results[:5]:
        raw_preview = result.get("text", "")[:180]
        safe_preview = raw_preview.encode("ascii", errors="replace").decode("ascii")
        try:
            print({
                "page": result.get("page"),
                "chunk": result.get("chunk"),
                "similarity_score": result.get("score"),
                "retrieval_score": round(
                    result.get("retrieval_score", 0.0),
                    6,
                ),
                "preview": safe_preview,
            })
        except Exception:
            pass

    if not results:
        return {
            "question": question,
            "message": "No matching passages found for this document.",
            "sources": [],
        }

    # Apply the provisional raw-score gate after ranking.
    relevant_results = [
        result
        for result in results
        if (
            result.get("score") is None
            or result["score"] >= MIN_SIMILARITY_SCORE
        )
    ][:MAX_SOURCE_PASSAGES]

    if not relevant_results:
        return {
            "question": question,
            "message": (
                "I couldn't find sufficiently relevant information "
                "in this document to answer confidently."
            ),
            "sources": [],
        }

    # Remove internal ranking data and send only the selected passages
    # to the answer generator.
    answer_sources = [
        {
            "page": result.get("page"),
            "chunk": result.get("chunk"),
            "score": result.get("score"),
            "text": result["text"],
        }
        for result in relevant_results
    ]

    try:
        answer = generate_answer(
            question=question,
            sources=answer_sources,
        )

    except Exception as exc:
        print("[DocuTrace] Gemini error:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail=(
                "Answer generation failed. "
                "Check the VS Code terminal for details."
            ),
        ) from exc

    return {
        "question": question,
        "answer": answer,
        "sources": [
            {
                "page": source["page"],
                "chunk": source["chunk"],
                "score": (
                    round(source["score"], 3)
                    if source["score"] is not None
                    else None
                ),
                "text": source["text"],
            }
            for source in answer_sources
        ],
    }