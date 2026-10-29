from fastapi import APIRouter, BackgroundTasks, HTTPException, Response, status

from app.schemas import create_video_request, create_video_response, video_status_response
from app.services.video_service import prepare_video, video_statuses
from rag.rag_chain import RAG


router = APIRouter(prefix="/videos", tags=["Videos"])


@router.post("",response_model=create_video_response)
def create_video(
    request: create_video_request,
    background_tasks: BackgroundTasks,
    response: Response,
):
    youtube_url = str(request.url)

    try:
        video_id = RAG.extract_video_id(youtube_url)
    except (ValueError, KeyError, IndexError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The URL does not contain a valid YouTube video ID.",
        ) from exc

    if not video_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The URL does not contain a valid YouTube video ID.",
        )

    existing_status = video_statuses.get(video_id, {}).get("status")

    if existing_status == "ready":
        response.status_code = status.HTTP_200_OK
        return create_video_response(video_id=video_id, status="ready")

    if existing_status == "processing":
        response.status_code = status.HTTP_202_ACCEPTED
        return create_video_response(video_id=video_id, status="processing")

    video_statuses[video_id] = {
        "status": "processing",
        "message": "The transcript is being indexed.",
    }

    background_tasks.add_task(
        prepare_video,
        video_id,
        youtube_url,
    )

    response.status_code = status.HTTP_202_ACCEPTED
    return create_video_response(video_id=video_id, status="processing")

@router.get("/{video_id}/status",response_model=video_status_response)
def get_video_status(video_id: str):
    video_status = video_statuses.get(video_id)

    if video_status is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This video has not been submitted for indexing in this API session.",
        )

    return video_status_response(
        video_id=video_id,
        status=video_status["status"],
        message=video_status.get("message"),
    )