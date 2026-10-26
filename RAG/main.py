from rag_chain import RAG

def main():
    youtube_url = input("Paste a YouTube video URL: ").strip()

    if not youtube_url:
        print("Please enter a YouTube URL.")
        return

    try:
        rag = RAG(youtube_url, k=7)
    except Exception as exc:
        print(f"Could not initialize the RAG chain: {exc}")
        return

    rag.run_question_loop()