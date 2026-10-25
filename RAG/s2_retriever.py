from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import FAISS


INDEX_PATH = "FAISS"
EMBEDDING_MODEL = "nomic-embed-text"
RESULT_COUNT = 7


def retrieve_documents(question):
    embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL)

    vector_store = FAISS.load_local(
        INDEX_PATH,
        embeddings,
        allow_dangerous_deserialization=True,
    )

    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": RESULT_COUNT},
    )

    return retriever.invoke(question)


def main():
    question = input("Ask a question about the video: ").strip()

    if not question:
        print("Please enter a question.")
        return

    results = retrieve_documents(question)

    if not results:
        print("No matching transcript chunks were found.")
        return

    print("\nRetrieved transcript chunks:\n")

    for number, document in enumerate(results, start=1):
        start = document.metadata.get("start", "unknown")
        end = document.metadata.get("end", "unknown")

        print(f"Result {number} — {float(start):.2f}s to {float(end):.2f}s")
        print(document.page_content)
        print()


if __name__ == "__main__":
    main()