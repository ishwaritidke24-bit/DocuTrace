from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient, models
import uuid

# A small embedding model suitable for a local prototype
embedding_model = SentenceTransformer(
    "sentence-transformers/all-MiniLM-L6-v2"
)

# Persistent local Qdrant storage
client = QdrantClient(path="./qdrant_data")

COLLECTION_NAME = "verityai_chunks"
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


def index_chunks(chunks: list[dict]):
    """Embed chunks and store their text and page metadata."""
    ensure_collection()

    points = []

    for chunk in chunks:
        text = chunk["text"]
        vector = embedding_model.encode(text).tolist()

        points.append(
            models.PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "text": text,
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


def search_chunks(question: str, limit: int = 3):
    """Find the chunks most semantically similar to a question."""
    ensure_collection()

    query_vector = embedding_model.encode(question).tolist()

    results = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
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
