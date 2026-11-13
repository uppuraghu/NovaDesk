from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    conversation_id: Optional[int] = None

class ChatResponse(BaseModel):
    answer: str
    conversation_id: int
    sources: list[dict] = []

class TicketCreate(BaseModel):
    customer_name: str = "Website visitor"
    subject: str = Field(min_length=3, max_length=250)
    description: str = Field(min_length=3)
    priority: str = "medium"
    category: str = "general"

class TicketUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None

class TicketOut(BaseModel):
    id: int
    customer_name: str
    subject: str
    description: str
    priority: str
    status: str
    category: str
    created_at: datetime
    updated_at: datetime
    class Config:
        from_attributes = True
