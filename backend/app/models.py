from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON,
    String, Text
)
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from .config import EMBEDDING_DIMENSION
from .database import Base
from .time_utils import utcnow


class Tenant(Base):
    __tablename__ = "tenants"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    is_claimed = Column(Boolean, nullable=False, default=False, server_default="false")
    users = relationship("User", back_populates="tenant")


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    email = Column(String(320), nullable=False, unique=True, index=True)
    display_name = Column(String(120), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="agent")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    tenant = relationship("Tenant", back_populates="users")

    @property
    def tenant_name(self):
        return self.tenant.name if self.tenant else None


class TeamInvitation(Base):
    __tablename__ = "team_invitations"
    id = Column(Integer, primary_key=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    email = Column(String(320), nullable=False, index=True)
    role = Column(String(20), nullable=False, default="agent")
    token_hash = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime)
    created_at = Column(DateTime, default=utcnow, nullable=False)


class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    title = Column(String(200), default="New conversation")
    created_at = Column(DateTime, default=utcnow, nullable=False)
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    conversation = relationship("Conversation", back_populates="messages")


class Ticket(Base):
    __tablename__ = "tickets"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    customer_name = Column(String(120), default="Website visitor")
    customer_email = Column(String(320))
    subject = Column(String(250), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(20), default="medium", nullable=False)
    status = Column(String(30), default="open", nullable=False)
    category = Column(String(80), default="general", nullable=False)
    sentiment = Column(String(30))
    suggested_category = Column(String(80))
    suggested_priority = Column(String(20))
    suggested_sentiment = Column(String(30))
    suggestion_reason = Column(Text)
    suggestion_status = Column(String(20))
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    assignee = relationship("User", foreign_keys=[assigned_to_id])
    creator = relationship("User", foreign_keys=[created_by_id])
    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan")

    @property
    def assigned_to_name(self):
        return self.assignee.display_name if self.assignee else None


class TicketComment(Base):
    __tablename__ = "ticket_comments"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    is_internal = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    ticket = relationship("Ticket", back_populates="comments")
    author = relationship("User")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, index=True)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    action = Column(String(80), nullable=False)
    details = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    actor = relationship("User")


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False, index=True)
    page_number = Column(Integer, default=1)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIMENSION).with_variant(JSON, "sqlite"), nullable=True)
    legacy_embedding_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)


Index(
    "ix_document_chunks_embedding_hnsw",
    DocumentChunk.embedding,
    postgresql_using="hnsw",
    postgresql_ops={"embedding": "vector_cosine_ops"}
)
Index("ix_document_chunks_tenant_filename", DocumentChunk.tenant_id, DocumentChunk.filename)
