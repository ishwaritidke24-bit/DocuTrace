
from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient, models
import uuid

embedding_model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2"
)

client = QdrantClient(path="./qdrant_data")

COLLECTION_NAME = "doctrace_chunks"
VECTOR_SIZE = 384


def ensure_collection():
    if not client.collection_exists(COLLECTION_NAME):
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(
                size=VECTOR_SIZE,
                distance=models.Distance.COSINE,
            ),
        )


def index_chunks(chunks: list[dict], document_id: str):
    ensure_collection()
    points = []

    for chunk in chunks:
        vector = embedding_model.encode(chunk["text"]).tolist()

        points.append(
            models.PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "document_id": document_id,
                    "text": chunk["text"],
                    "page": chunk["page"],
                    "chunk": chunk["chunk"],
                },
            )
        )

    if points:
        client.upsert(
            collection_name=COLLECTION_NAME,
            points=points,
            wait=True,
        )

    return len(points)


def search_chunks(
    question: str,
    document_id: str,
    limit: int = 3,
):
    ensure_collection()

    query_vector = embedding_model.encode(question).tolist()

    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        query_filter=models.Filter(
            must=[
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value=document_id),
                )
            ]
        ),
        limit=limit,
        with_payload=True,
    ).points

    return [
        {
            "text": result.payload["text"],
            "page": result.payload["page"],
            "chunk": result.payload["chunk"],
            "score": result.score,
        }
        for result in results
    ]
