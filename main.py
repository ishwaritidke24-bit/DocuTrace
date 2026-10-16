
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
                    pages.append({
                        "page": page_number,
                        "text": text
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
        "total_pages": len(pages),
        "pages_with_text": len(pages),
        "extracted_pages": pages
    }
