from operator import itemgetter
from schemas import QuestionRewrites

from langchain_core.documents import Document
from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable, RunnableLambda, RunnableParallel
from langchain_core.retrievers import BaseRetriever
from langchain_community.vectorstores import FAISS
from langchain_ollama import OllamaEmbeddings, ChatOllama

INDEX_PATH = "FAISS/56f442932d329073"
EMBEDDING_MODEL = "nomic-embed-text"
RETRIEVER_K = 7

def create_retriever(index_path: str, k: int = 7) -> BaseRetriever:
    embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL)

    vector_store = FAISS.load_local(
        index_path,
        embeddings,
        allow_dangerous_deserialization=True,
    )

    return vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": k},
    )

rewrite_prompt = ChatPromptTemplate.from_messages([
    (
        "system",
        """
            Generate exactly two alternate search queries for the user's question.

            Preserve the same intent and scope, but use different vocabulary and
            phrasing from the original question. Avoid reusing its important words
            or phrases in either query. The two alternate queries should also use
            different wording from each other.

            Keep each query concise and useful for finding relevant transcript
            passages. Do not answer the question or change its meaning.
            Return the queries in the requested structured format.
        """
    ),
    (
        "human", 
        "Original question: {question}"
    ),
])


def rewrite_stage(llm: BaseChatModel) -> Runnable:
    rewrite_chain = rewrite_prompt | llm.with_structured_output(QuestionRewrites)

    return (
        RunnableParallel({
            "original_data": RunnableLambda(lambda data: data),
            "rewrites"     : itemgetter("question") | rewrite_chain,
        })
        | RunnableLambda(
            lambda result: {
                **result["original_data"],
                "rewrites": result["rewrites"],
            }
        )
    )


build_queries = RunnableLambda(
    lambda data: {
        **data,
        "question_1": data["question"],
        "question_2": data["rewrites"].rewrite_1,
        "question_3": data["rewrites"].rewrite_2,
    }
)


def parallel_retrieval(retriever: BaseRetriever) -> Runnable:
    return RunnableParallel({
        "question_1": itemgetter("question_1") | retriever,
        "question_2": itemgetter("question_2") | retriever,
        "question_3": itemgetter("question_3") | retriever,
        "k": itemgetter("k"),
    })


def reciprocal_rank_fusion(result_lists: list[list[Document]], k: int, c: int = 60) -> list[Document]:
    scores = {}
    documents = {}

    for query_number, result_list in enumerate(result_lists, start=1):
        seen_in_this_list = set()

        for rank, document in enumerate(result_list, start=1):
            metadata = document.metadata
            document_key = (
                metadata.get("video_id"),
                metadata.get("start"),
                metadata.get("end"),
                document.page_content,
            )

            if document_key in seen_in_this_list:
                continue

            seen_in_this_list.add(document_key)
            documents[document_key] = document

            query_weight = 4 if query_number == 1 else 1
            scores[document_key] = scores.get(document_key, 0) + query_weight / (c + rank)

    ranked_keys = sorted(scores, key=scores.__getitem__, reverse=True)
    return [documents[key] for key in ranked_keys[:k]]

rrf_ordering = RunnableLambda(
    lambda results: reciprocal_rank_fusion(
        [
            results["question_1"],
            results["question_2"],
            results["question_3"],
        ],
        k=results["k"],
    )
)


def pass_input(k: int) -> Runnable:
    return RunnableLambda(
        lambda question: {
            "question": question,
            "k": k,
        }
    )
    
    
def main() -> None:
    embeddings = OllamaEmbeddings(model=EMBEDDING_MODEL)

    vector_store = FAISS.load_local(
        INDEX_PATH,
        embeddings,
        allow_dangerous_deserialization=True,
    )

    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 7},
    )

    rewrite_llm = ChatOllama(
        model="qwen3.5:latest",
        temperature=0.7,
        reasoning=False,
    )

    rewrite_stage = rewrite_stage(rewrite_llm)

    while True:
        question = input("\nAsk a question about the video (or type 'exit'): ").strip()

        if question.lower() == "exit":
            print("Goodbye!")
            break

        if not question:
            print("Please enter a question.")
            continue

        try:
            rewrite_result = rewrite_stage.invoke({"question": question})
            query_data = build_queries.invoke(rewrite_result)

            queries = [
                query_data["question_1"],
                query_data["question_2"],
                query_data["question_3"],
            ]

            print("\n--- Search queries ---")
            for number, query in enumerate(queries, start=1):
                print(f"{number}. {query}")

            result_lists = [retriever.invoke(query) for query in queries]

            for query_number, documents in enumerate(result_lists, start=1):
                print(f"\n--- Q{query_number} retrieved chunks ---")

                for chunk_number, document in enumerate(documents, start=1):
                    start = float(document.metadata.get("start", 0))
                    end = float(document.metadata.get("end", 0))

                    print(f"Q{query_number}_chunk{chunk_number}: {start:.2f}s to {end:.2f}s")

            scores = {}
            documents_by_key = {}
            chunk_labels = {}

            for query_number, result_list in enumerate(result_lists, start=1):
                seen_in_this_list = set()

                for rank, document in enumerate(result_list, start=1):
                    metadata = document.metadata
                    document_key = (
                        metadata.get("video_id"),
                        metadata.get("start"),
                        metadata.get("end"),
                        document.page_content,
                    )

                    if document_key in seen_in_this_list:
                        continue

                    seen_in_this_list.add(document_key)
                    documents_by_key[document_key] = document
                    chunk_labels.setdefault(document_key, []).append(f"Q{query_number}_chunk{rank}")
                    scores[document_key] = scores.get(document_key, 0) + 1 / (60 + rank)

            ranked_keys = sorted(scores, key=scores.__getitem__, reverse=True)

            print("\n--- Reciprocal rank fusion scores ---")
            for rank, document_key in enumerate(ranked_keys, start=1):
                print(f"{rank}. {', '.join(chunk_labels[document_key])} — RRF: {scores[document_key]:.6f}")

            print("\n--- Final 7 chunks ---")
            for number, document_key in enumerate(ranked_keys[:7], start=1):
                document = documents_by_key[document_key]
                start = document.metadata.get("start", "unknown")
                end = document.metadata.get("end", "unknown")

                print(f"\n{number}. {float(start):.2f}s to {float(end):.2f}s")
                print(document.page_content)

        except Exception as exc:
            print(f"Error during multi query retrieval: {exc}")


if __name__ == "__main__":
    main()