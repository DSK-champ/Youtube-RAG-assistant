import logging
from rag.rag_chain import RAG

logger = logging.getLogger(__name__)

video_statuses:dict[str, dict[str, str]] = {}
rag_instances: dict[str, RAG] = {}

def prepare_video(video_id: str, youtube_url: str) -> None:
    """Create or reuse a RAG instance and record the outcome"""
    try:
        rag = RAG(youtube_url)
        rag_instances[video_id] = rag
        
        video_statuses[video_id] = {
            "status": "ready",
            "message": "The video is ready for questions"
        }
    except Exception:
        logger.exception("Could not prepare video %s", video_id)
        
        video_statuses[video_id] = {
            "status" : "failed",
            "message" : "The video could not be indexxed. Check the API logs for details."
        }
    