from llm_service import generate_answer
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import pymupdf
import uuid

from search_engine import index_chunks, search_chunks

app = FastAPI(title="DocuTrace API")

MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB


class QueryRequest(BaseModel):
    document_id: str
    question: str


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 200,
):
    if chunk_size <= 0 or not 0 <= overlap < chunk_size:
        raise ValueError("Invalid chunk size or overlap.")

    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end == len(text):
            break

        start = end - overlap

    return chunks


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

    if not content.startswith(b"%PDF-"):
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
                text = page.get_text().strip()

                for chunk_number, chunk in enumerate(
                    chunk_text(text), start=1
                ):
                    chunks.append({
                        "page": page_number,
                        "chunk": chunk_number,
                        "text": chunk,
                    })

    except Exception as exc:
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
        raise HTTPException(
            status_code=500,
            detail="Could not index the PDF.",
        ) from exc

    return {
        "message": "PDF uploaded and indexed successfully",
        "filename": file.filename,
        "document_id": document_id,
        "chunks_indexed": indexed_count,
    }


@app.post("/query")
def query_document(request: QueryRequest):
    if not request.question.strip():
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )

    try:
        results = search_chunks(
            question=request.question,
            document_id=request.document_id,
            limit=3,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Document search failed.",
        ) from exc

    if not results:
        return {
            "question": request.question,
            "message": "No matching passages found for this document.",
            "sources": [],
        }

    try:
        answer = generate_answer(
            question=request.question,
            sources=results,
        )
    except Exception as exc:
        print("Gemini error:", repr(exc))
        raise HTTPException(
            status_code=502,
            detail="Answer generation failed. Check the VS Code terminal for details.",
            ) from exc

    return {
        "question": request.question,
        "answer": answer,
        "sources": [
            {
                "page": source["page"],
                "chunk": source["chunk"],
                "score": round(source["score"], 3),
                "text": source["text"],
            }
            for source in results
        ],
    }
