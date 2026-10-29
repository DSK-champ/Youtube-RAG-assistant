from langchain_core.output_parsers import StrOutputParser
from langchain_ollama import ChatOllama

from rag.steps.s2_retriever import create_retriever
from rag.steps.s3_augmentation import document_formatter, prompt

#==============================================================#
# this file is only for testing the flow and output generation #
#==============================================================#

def main():
    question = input("Ask a question about the video: ").strip()

    if not question:
        print("Please enter a question.")
        return

    # Create the retriever once for this CLI run.
    retriever = create_retriever()

    model = ChatOllama(
        model="qwen3.5:latest",
        think=False,
        reasoning=False,
        num_predict=1024,
    )
    answer_chain = prompt | model | StrOutputParser()

    documents = retriever.invoke(question)
    if not documents:
        print("No matching transcript chunks were found.")
        return

    print("\nRetrieved transcript chunks:\n")
    for number, document in enumerate(documents, start=1):
        start = float(document.metadata.get("start", 0))
        end = float(document.metadata.get("end", 0))

        print(f"Chunk {number} — {start:.2f}s to {end:.2f}s")
        print(document.page_content)
        print()

    context = document_formatter.invoke(documents)
    answer = answer_chain.invoke({
        "question": question,
        "context": context,
    })

    print("\nAnswer:")
    print(answer)

    print("\nSources:")
    for document in documents:
        start = float(document.metadata.get("start", 0))
        end = float(document.metadata.get("end", 0))
        print(f"- {start:.2f}s to {end:.2f}s")


if __name__ == "__main__":
    main()