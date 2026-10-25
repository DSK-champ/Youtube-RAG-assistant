from s2_retriever import retrieve_documents
from s3_augmentation import generate_answer

def main():
    question = input("Ask a question about the video : ").strip()
    
    if not question:
        print("Please enter a question")
        return
    
    documents = retrieve_documents(question)
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
    
    answer = generate_answer(question, documents)
    
    print("\nAnswer : ")
    print(answer)
    
    print("\nSources : ")
    for document in documents:
        start = float(document.metadata.get("start", 0))
        end   = float(document.metadata.get("end"  , 0))
        print(f"- {start:.2f}s to {end:.2f}s")
        
if __name__ == "__main__":
    main()