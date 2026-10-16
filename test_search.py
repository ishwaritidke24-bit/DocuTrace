from search_engine import index_chunks, search_chunks

sample_chunks = [
    {
        "page": 1,
        "chunk": 1,
        "text": "Students must submit scholarship applications before 15 November.",
    },
    {
        "page": 2,
        "chunk": 1,
        "text": "The college library closes at 6 PM on weekdays.",
    },
    {
        "page": 3,
        "chunk": 1,
        "text": "Applicants need to provide their income certificate.",
    },
]

count = index_chunks(sample_chunks)
print(f"Indexed {count} chunks.")

results = search_chunks("When is the scholarship application deadline?")

for result in results:
    print("\nPage:", result["page"])
    print("Similarity score:", round(result["score"], 3))
    print("Text:", result["text"])
