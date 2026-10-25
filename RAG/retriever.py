from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import FAISS


INDEX_PATH = "FAISS"
EMBEDDING_MODEL = "nomic-embed-text"
RESULT_COUNT = 3


def main():

    embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL)

    vector_store = FAISS.load_local(
        INDEX_PATH,
        embeddings,
        allow_dangerous_deserialization=True,
    )

    question = input("Ask a question about the video: ").strip()

    if not question:
        print("Please enter a question.")
        return

    scored_results = vector_store.similarity_search_with_score(
        question,
        k=RESULT_COUNT,
    )

    # for number, (document, distance) in enumerate(scored_results, start=1):
    #     print(f"Result {number} — distance: {distance:.4f}")
    #     print(document.page_content)
    
    DISTANCE_THRESHOLD = 0.9

    results = [
        document
        for document, distance in scored_results
        if distance <= DISTANCE_THRESHOLD
    ]

    if not results:
        print("No matching transcript chunks were found.")
        return

    print("\nRetrieved transcript chunks:\n")

    for number, document in enumerate(results, start=1):
        start = document.metadata.get("start", "unknown")
        end   = document.metadata.get("end",   "unknown")

        print(f"Result {number} — {float(start):.2f}s to {float(end):.2f}s")
        print(document.page_content);   print()


if __name__ == "__main__":
    main()