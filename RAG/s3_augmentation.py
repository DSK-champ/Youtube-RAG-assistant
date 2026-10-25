from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langchain_ollama import ChatOllama


def format_documents(documents):
    context_parts = []

    for document in documents:
        start = document.metadata.get("start", "unknown")
        end = document.metadata.get("end", "unknown")
        context_parts.append(
            f"[{start}s to {end}s]\n{document.page_content}"
        )

    return "\n\n".join(context_parts)


document_formatter = RunnableLambda(format_documents)

prompt = ChatPromptTemplate.from_template("""
    You answer questions using YouTube transcript captions.

    Use only the transcript context below. If it does not contain enough information
    to answer the question, say that the transcript does not provide enough
    information. Do not make up details.

    Transcript context:
    {context}

    Question:
    {question}

    Give a concise answer. Do not include your private reasoning.
""")
