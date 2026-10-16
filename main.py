
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="DocuTrace API")


class QueryRequest(BaseModel):
    question: str


@app.get("/")
def home():
    return {"message": "DocuTrace API is running"}


@app.post("/query")
def query_document(request: QueryRequest):
    return {
        "question": request.question,
        "answer": "Document question-answering will be implemented here."
    }
