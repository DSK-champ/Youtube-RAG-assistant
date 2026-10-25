from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_ollama import ChatOllama

from s2_retriever import create_retriever
from s3_augmentation import document_formatter, prompt


class RAGChain:
    def __init__(self):
        self.k = 4
        self.retriever = create_retriever(k=self.k)

        self.llm = ChatOllama(
            model="qwen3.5:latest",
            temperature=0.2,
            reasoning=False,
        )

        answer_chain       = prompt | self.llm | StrOutputParser()
        question_input     = RunnableLambda(lambda question: {"question": question})
        retrieve_documents = RunnableLambda(lambda data: data["question"]) | self.retriever
        format_context     = RunnableLambda(lambda data: data["documents"]) | document_formatter
        answer_input       = RunnableLambda(lambda data: {"question": data["question"], "context": data["context"],}) | answer_chain

        self.chain = (
              question_input
            | RunnablePassthrough.assign(documents=retrieve_documents)
            | RunnablePassthrough.assign(context=format_context)
            | RunnablePassthrough.assign(answer=answer_input)
        )

    def invoke(self, question: str) -> dict:
        return self.chain.invoke(question)

def format_timestamp(seconds: float) -> str:
    total_seconds = round(float(seconds))

    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds_part = divmod(remainder, 60)

    return f"{hours:02}:{minutes:02}:{seconds_part:02}"

def main():

    try:
        rag = RAGChain()
    except Exception as exc:
        print(f"Could not initialize the RAG chain: {exc}")
        return

    while True:
        print("\n=======================================================")
        question = input("Ask a question (or type 'exit' to quit): ").strip()

        if question.lower() == "exit":
            print("Goodbye!")
            break

        if not question:
            continue

        try:
            result = rag.invoke(question)

            print("\n--- Answer ---")
            print(result["answer"])

            print("\n--- Retrieved Sources ---")
            for number, document in enumerate(result["documents"], start=1):
                start = document.metadata.get("start", "unknown")
                end = document.metadata.get("end", "unknown")
                print(f"{number}. {format_timestamp(start)} to " f"{format_timestamp(end)}")
                
        except Exception as exc:
            print(f"Error processing question: {exc}")


if __name__ == "__main__":
    main()