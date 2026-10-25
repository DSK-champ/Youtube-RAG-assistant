from langchain_ollama import ChatOllama

def generate_answer(question, documents):
    
    context_parts = []
    
    for document in documents:
        start = document.metadata.get("start", "unknown")
        end   = document.metadata.get("end"  , "unknown")
        
        context_parts.append(
            f"[{start}s to {end}s]\n {document.page_content}"
        )
        
    context = "\n\n".join(context_parts)
    
    prompt = f"""
        You answer questions using YouTube transcript captions.

        Use only the transcript context below. If it does not contain enough information
        to answer the question, say that the transcript does not provide enough
        information. Do not make up details.

        Transcript context:
        {context}

        Question:
        {question}

        Give a concise answer. Do not include your private reasoning.
    """
    
    model = ChatOllama(
        model="qwen3.5:latest",
        think=False,
        reasoning=False,
        num_predict=1024,
    )
    response = model.invoke(prompt)
    # print("Raw response:", repr(response))

    
    return response.content

if __name__ == "__main__":
    question = input("Enter your question: ")
    
    from langchain_core.documents import Document
    
    example_documents = [
        Document(
            page_content="I'm Stefano, and I'm the instructor of this class.",
            metadata={"start": 5.84, "end": 36.24},
        )
    ]
    
    answer = generate_answer(question, example_documents)
    print("\nAnswer : ")
    print(answer)