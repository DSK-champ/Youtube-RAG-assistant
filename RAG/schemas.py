from pydantic import BaseModel, Field

class QuestionRewrites(BaseModel):
    rewrite_1: str = Field(description="First alternate phrasing of the question.")
    rewrite_2: str = Field(description="Second alternate phrasing, different from the first.")