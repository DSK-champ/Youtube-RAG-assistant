# we will turn the transcript into documents then conver them into vector embeddings then finally store them in FAISS

from load_transcript import get_video_id, load_transcript
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import FAISS

youtube_url = input("Paste a YouTube video URL: ")
video_id = get_video_id(youtube_url)
segments = load_transcript(video_id)

documents = []

for segment in segments:
    documents.append(Document(
        page_content=segment["text"],
        metadata={
            "video_id": video_id,
            "start": segment["start"],
            "duration": segment["duration"],
        },
    ))
    
batch_size = 32
embeddings = OllamaEmbeddings(model="nomic-embed-text")
vector_store = FAISS.from_documents(documents[:batch_size], embeddings)

for start in range(batch_size, len(documents), batch_size):
    batch = documents[start : start + batch_size]
    vector_store.add_documents(batch)

# Save the index locally so you can load it later
vector_store.save_local("FAISS")

print(f"Saved {len(documents)} transcript segments to the FAISS index.")