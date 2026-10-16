
from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import pymupdf

app = FastAPI(title="VerityAI API")


class QueryRequest(BaseModel):
    question: str


@app.get("/")
def home():
    return {"message": "VerityAI API is running"}


@app.post("/query")
def query_document(request: QueryRequest):
    return {
        "question": request.question,
        "answer": "Document question-answering will be implemented here."
    }

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200):
    if chunk_size <= 0 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("Overlap must be non-negative and smaller than chunk size.")

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

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF file."
        )

    content = await file.read()

    if not content.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid PDF."
        )

    try:
        with pymupdf.open(stream=content, filetype="pdf") as document:
            pages = []

            for page_number, page in enumerate(document, start=1):
                text = page.get_text().strip()
                if text:
                    page_chunks = chunk_text(text)
                    for chunk_index, chunk in enumerate(page_chunks, start=1):
                        pages.append({
                            "page": page_number,
                            "chunk": chunk_index,
                            "text": chunk
                            })


    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not read this PDF."
        ) from exc

    if not pages:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found. Scanned PDFs need OCR."
        )

    
    return {
        "filename": file.filename,
        "chunks_created": len(pages),
        "chunks": pages
    }

