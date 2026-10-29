from fastapi import FastAPI

from app.routes.videos import router as videos_router
from app.routes.chat import router as chat_router


app = FastAPI(
    title="Youtube RAG API",
    description="Ask questions about the video",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "youtube-rag-api",
    }


app.include_router(videos_router)
app.include_router(chat_router)