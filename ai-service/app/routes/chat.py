import logging

from fastapi import APIRouter, HTTPException, status

from app.schemas import chat_request, chat_response, source_response
from app.services.video_service import rag_instances, video_statuses


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


@router.post("",response_model=chat_response)
def chat(request: chat_request):
    video_id = request.video_id

    video_status = video_statuses.get(video_id)

    if video_status is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This video has not been submitted during this API session.",
        )

    if video_status["status"] == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This video is still being indexed. Try again when its status is ready.",
        )

    if video_status["status"] == "failed":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=video_status.get(
                "message",
                "This video could not be indexed.",
            ),
        )

    rag = rag_instances.get(video_id)

    if rag is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The RAG instance for this video is not available.",
        )

    try:
        result = rag.invoke(request.question)

        sources = []
        for document in result["documents"]:
            metadata = document.metadata

            sources.append(
                source_response(
                    start=float(metadata["start"]),
                    end=float(metadata["end"]),
                    text=document.page_content,
                )
            )

        return chat_response(
            answer=result["answer"],
            url=f"https://www.youtube.com/watch?v={video_id}",
            video_id=video_id,
            sources=sources,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not answer question for video %s", video_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The question could not be answered.",
        ) from exc