# DocuTrace — Evidence-First Document Intelligence

DocuTrace is an AI-powered document intelligence system that enables users to upload PDF documents and ask questions about their content. It uses Retrieval-Augmented Generation (RAG), semantic search, and Large Language Models (LLMs) to generate context-grounded answers from retrieved document evidence.

The goal is simple: make document-based AI more transparent, relevant, and reliable.

## Features

- **PDF Upload:** Upload PDF documents for analysis.
- **Document Processing:** Extract and process text into searchable chunks.
- **Semantic Search:** Retrieve relevant information based on the meaning of a query.
- **RAG Pipeline:** Generate answers using retrieved document context.
- **Evidence-Grounded Responses:** Help users find answers supported by their uploaded documents.
- **REST API:** Expose document processing and question-answering functionality through FastAPI.

## Tech Stack

- **Language:** Python
- **Backend:** FastAPI
- **AI/LLM:** Large Language Models
- **Retrieval:** Retrieval-Augmented Generation (RAG)
- **Document Processing:** PyMuPDF
- **Validation:** Pydantic
- **Vector Search:** Semantic embeddings and vector database integration

## How It Works

1. Upload a PDF document.
2. Extract its text and divide it into manageable chunks.
3. Convert document chunks into searchable representations.
4. Retrieve relevant chunks for a user's question.
5. Generate an answer using the retrieved context.

## Getting Started

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd DocuTrace
```

### 2. Create a Virtual Environment

```bash
python -m venv .venv
```

Activate it on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Install Dependencies

```bash
python -m pip install -r requirements.txt
```

### 4. Configure Environment Variables

Create a `.env` file in the project root and add the API credentials required by your configured LLM provider.

```env
OPENAI_API_KEY=your_api_key_here
```

Keep your API keys private. Never commit your `.env` file to GitHub.

### 5. Run the API

```bash
python -m uvicorn main:app --reload
```

Once the server starts, open:

- API documentation: `http://127.0.0.1:8000/docs`
- API root: `http://127.0.0.1:8000/`

## Project Structure

```text
DocuTrace/
├── main.py             # FastAPI application and endpoints
├── llm_service.py      # LLM response generation
├── search_engine.py    # Document indexing and retrieval
├── requirements.txt    # Project dependencies
├── .env                # Local environment variables
└── README.md
```

*The structure may vary as the project evolves.*

## Project Goals

- Improve the reliability of document-based question answering.
- Ground generated responses in retrieved document content.
- Combine modern AI retrieval techniques with a practical backend API.
- Build a foundation for evidence-focused document intelligence.

## Future Improvements

- Display supporting document excerpts and page references.
- Add source attribution for generated answers.
- Improve retrieval quality through embedding and chunking experiments.
- Add document management and multi-document querying.
- Build an interactive frontend for a complete user experience.

## Status

Actively developed as a practical AI engineering project exploring document processing, semantic retrieval, RAG pipelines, and API development.

## Author

Developed by **Ishwari Tidke**.
