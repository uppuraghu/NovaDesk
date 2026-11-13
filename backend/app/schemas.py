from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)
    tenant_name: str = Field(min_length=2, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    tenant_id: int
    email: EmailStr
    display_name: str
    role: str
    tenant_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class InvitationCreate(BaseModel):
    email: EmailStr
    role: Literal["agent", "admin"] = "agent"


class InvitationOut(BaseModel):
    email: EmailStr
    role: str
    expires_at: datetime


class AcceptInvitation(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=12, max_length=128)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=5000)
    conversation_id: Optional[int] = None


class ChatResponse(BaseModel):
    answer: str
    conversation_id: int
    sources: list[dict] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)


class TicketCreate(BaseModel):
    customer_name: str = Field(default="Website visitor", max_length=120)
    customer_email: Optional[EmailStr] = None
    subject: str = Field(min_length=3, max_length=250)
    description: str = Field(min_length=3, max_length=10000)
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    category: Literal["general", "billing", "technical", "account", "orders", "other"] = "general"
    assigned_to_id: Optional[int] = None


class TicketUpdate(BaseModel):
    status: Optional[Literal["open", "in_progress", "resolved"]] = None
    priority: Optional[Literal["low", "medium", "high", "urgent"]] = None
    category: Optional[Literal["general", "billing", "technical", "account", "orders", "other"]] = None
    assigned_to_id: Optional[int] = None


class ClassificationOut(BaseModel):
    category: Literal["general", "billing", "technical", "account", "orders", "other"]
    priority: Literal["low", "medium", "high", "urgent"]
    sentiment: Literal["positive", "neutral", "negative", "frustrated"]
    reason: str = Field(max_length=1000)


class TicketOut(BaseModel):
    id: int
    tenant_id: int
    created_by_id: int
    assigned_to_id: Optional[int]
    assigned_to_name: Optional[str] = None
    customer_name: str
    customer_email: Optional[str]
    subject: str
    description: str
    priority: str
    status: str
    category: str
    sentiment: Optional[str]
    suggested_category: Optional[str]
    suggested_priority: Optional[str]
    suggested_sentiment: Optional[str]
    suggestion_reason: Optional[str]
    suggestion_status: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TicketCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    is_internal: bool = False


class TicketCommentOut(BaseModel):
    id: int
    author_id: int
    author_name: str
    body: str
    is_internal: bool
    created_at: datetime


class AuditOut(BaseModel):
    id: int
    actor_id: int
    actor_name: str
    action: str
    details: dict
    created_at: datetime
