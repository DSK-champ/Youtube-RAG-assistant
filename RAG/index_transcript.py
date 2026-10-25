# we will turn the transcript into documents then conver them into vector embeddings then finally store them in FAISS

import math
from load_transcript import get_video_id, load_transcript
from langchain_core.documents import Document
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import FAISS

youtube_url = input("Paste a YouTube video URL: ")
video_id = get_video_id(youtube_url)
segments = load_transcript(video_id)


embeddings = OllamaEmbeddings(model="nomic-embed-text")


def cosine_distance(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    return 1 - dot / (norm_a * norm_b)


# Embed captions in small batches to avoid sending all 1,361 at once.
caption_vectors = []
for start in range(0, len(segments), 32):
    batch_text = [s["text"] for s in segments[start : start + 32]]
    caption_vectors.extend(embeddings.embed_documents(batch_text))

# Measure the meaning change between each pair of neighboring captions.
distances = [
    cosine_distance(caption_vectors[i - 1], caption_vectors[i])
    for i in range(1, len(segments))
]

# Treat the largest 10% of changes as possible topic boundaries.
threshold = sorted(distances)[int(0.9 * (len(distances) - 1))]

documents = []
chunk_start = 0

for i in range(1, len(segments)):
    elapsed = segments[i]["start"] - segments[chunk_start]["start"]
    meaning_changed = distances[i - 1] >= threshold

    # Split at a meaning change after 20 seconds, or cap at 60 seconds.
    if (meaning_changed and elapsed >= 20) or elapsed >= 60:
        chunk = segments[chunk_start:i]

        documents.append(
            Document(
                page_content=" ".join(s["text"] for s in chunk),
                metadata={
                    "video_id": video_id,
                    "start": chunk[0]["start"],
                    "end": chunk[-1]["start"] + chunk[-1]["duration"],
                },
            )
        )

        # Start the next chunk with the last two captions as overlap.
        chunk_start = max(i - 2, chunk_start + 1)

# Add the final chunk.
chunk = segments[chunk_start:]
documents.append(
    Document(
        page_content=" ".join(s["text"] for s in chunk),
        metadata={
            "video_id": video_id,
            "start": chunk[0]["start"],
            "end": chunk[-1]["start"] + chunk[-1]["duration"],
        },
    )
)
    
batch_size = 32
vector_store = FAISS.from_documents(documents[:batch_size], embeddings)

for start in range(batch_size, len(documents), batch_size):
    batch = documents[start : start + batch_size]
    vector_store.add_documents(batch)

# Save the index locally so you can load it later
vector_store.save_local("FAISS")

print(f"Saved {len(documents)} transcript chunks to the FAISS index.")