from typing import Literal
from pydantic import BaseModel, Field, HttpUrl, field_validator

class create_video_request(BaseModel):
    url: HttpUrl = Field(
        description="Youtube video URL to index.",
        examples=["https://www.youtube.com/watch?v=VIDEO_ID"]
    )
    
class create_video_response(BaseModel):
    video_id: str
    status: Literal["processing", "ready"]
    
class video_status_response(BaseModel):
    video_id: str
    status: Literal["processing", "ready", "failed"]
    message: str | None = None
    
class chat_request(BaseModel):
    video_id: str = Field(
        min_length=1,
        description="Youtube video ID whose transcript should be searched."
    )
    question: str = Field(
        min_length=1,
        description="Question to answer usinf the video's captions",
        examples=["who is the teacher of this course?"]
        )
    
    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        question = value.strip()

        if not question:
            raise ValueError("Question cannot be blank.")

        return question
    
class source_response(BaseModel):
    start: float = Field(ge=0, description="Source start time in seconds.")
    end: float = Field(ge=0, description="Source end time in seconds.")
    text: str
    
class chat_response(BaseModel):
    answer: str
    url: HttpUrl = Field(description="Link to the video at the source timestamp.")
    video_id: str
    sources: list[source_response]