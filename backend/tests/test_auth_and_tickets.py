import re
from unittest.mock import AsyncMock

import app.main as main
from app.schemas import ClassificationOut
from app.models import DocumentChunk, Tenant, Ticket
from tests.conftest import auth_headers, register


def test_authentication_and_tenant_isolation(client):
    client, _ = client
    assert client.get("/api/tickets").status_code == 401

    owner_a = register(client, "a@example.com", "Workspace A")
    headers_a = auth_headers(owner_a)
    ticket_response = client.post("/api/tickets", headers=headers_a, json={
        "customer_name": "Customer",
        "subject": "Cannot sign in",
        "description": "Login returns an error",
    })
    assert ticket_response.status_code == 201
    ticket_id = ticket_response.json()["id"]

    owner_b = register(client, "b@example.com", "Workspace B")
    headers_b = auth_headers(owner_b)
    assert client.get("/api/tickets", headers=headers_b).json() == []
    assert client.get(f"/api/tickets/{ticket_id}/comments", headers=headers_b).status_code == 404
    assert client.get("/api/auth/me", headers=headers_b).json()["tenant_name"] == "Workspace B"


def test_invitation_assignment_comments_and_audit(client, monkeypatch):
    client, session_factory = client
    owner = register(client)
    headers = auth_headers(owner)
    sent_messages = []
    monkeypatch.setattr(main, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(main, "send_notification", lambda *args: sent_messages.append(args))

    invite = client.post("/api/team/invitations", headers=headers, json={
        "email": "agent@example.com",
        "role": "agent",
    })
    assert invite.status_code == 201
    token = re.search(r"invite=([A-Za-z0-9_-]+)", sent_messages[0][2]).group(1)
    accepted = client.post("/api/auth/accept-invitation", json={
        "token": token,
        "display_name": "Support Agent",
        "password": "another-password-123",
    })
    assert accepted.status_code == 201
    agent_headers = auth_headers(accepted.json())
    agent_id = accepted.json()["user"]["id"]

    created = client.post("/api/tickets", headers=headers, json={
        "customer_name": "Customer",
        "customer_email": "customer@example.com",
        "subject": "Refund request",
        "description": "Please review my refund.",
        "assigned_to_id": agent_id,
    })
    assert created.status_code == 201
    ticket_id = created.json()["id"]
    assert created.json()["assigned_to_name"] == "Support Agent"

    comment = client.post(f"/api/tickets/{ticket_id}/comments", headers=agent_headers, json={
        "body": "I am reviewing this request.",
        "is_internal": True,
    })
    assert comment.status_code == 201
    assert comment.json()["is_internal"] is True
    audit = client.get(f"/api/tickets/{ticket_id}/audit", headers=headers)
    assert audit.status_code == 200
    assert [entry["action"] for entry in audit.json()] == [
        "ticket.created",
        "ticket.comment_added",
    ]

    with session_factory() as db:
        assert db.query(main.TeamInvitation).one().accepted_at is not None


def test_ai_classification_requires_human_approval(client, monkeypatch):
    client, _ = client
    owner = register(client)
    headers = auth_headers(owner)
    ticket = client.post("/api/tickets", headers=headers, json={
        "subject": "Refund for a damaged order",
        "description": "The package arrived damaged and I need help.",
    }).json()
    monkeypatch.setattr(
        main,
        "classify_ticket",
        AsyncMock(return_value=ClassificationOut(
            category="orders",
            priority="high",
            sentiment="frustrated",
            reason="Customer reports a damaged package.",
        )),
    )

    suggested = client.post(f"/api/tickets/{ticket['id']}/classify", headers=headers)
    assert suggested.status_code == 200
    assert suggested.json()["suggestion_status"] == "pending_approval"
    assert suggested.json()["priority"] == "medium"

    approved = client.post(
        f"/api/tickets/{ticket['id']}/classification/approve",
        headers=headers,
    )
    assert approved.status_code == 200
    assert approved.json()["suggestion_status"] == "approved"
    assert approved.json()["priority"] == "high"
    assert approved.json()["sentiment"] == "frustrated"

    second_ticket = client.post("/api/tickets", headers=headers, json={
        "subject": "Another refund request",
        "description": "Please review this order.",
    }).json()
    client.post(f"/api/tickets/{second_ticket['id']}/classify", headers=headers)
    manually_updated = client.patch(
        f"/api/tickets/{second_ticket['id']}",
        headers=headers,
        json={"priority": "urgent"},
    )
    assert manually_updated.json()["suggestion_status"] == "rejected"


def test_login_rejects_invalid_password(client):
    client, _ = client
    register(client)
    response = client.post("/api/auth/login", json={
        "email": "owner@example.com",
        "password": "wrong-password",
    })
    assert response.status_code == 401


def test_legacy_workspace_requires_configured_bootstrap_owner(client, monkeypatch):
    client, session_factory = client
    with session_factory() as db:
        db.add(Tenant(id=1, name="Legacy Workspace"))
        db.flush()
        db.add(Ticket(
            tenant_id=1,
            subject="Existing ticket",
            description="Legacy customer data",
        ))
        db.commit()

    monkeypatch.setattr(main, "BOOTSTRAP_ADMIN_EMAIL", "")
    blocked = client.post("/api/auth/register", json={
        "email": "anyone@example.com",
        "password": "test-password-123",
        "display_name": "New User",
        "tenant_name": "New Workspace",
    })
    assert blocked.status_code == 503

    monkeypatch.setattr(main, "BOOTSTRAP_ADMIN_EMAIL", "owner@example.com")
    forbidden = client.post("/api/auth/register", json={
        "email": "attacker@example.com",
        "password": "test-password-123",
        "display_name": "New User",
        "tenant_name": "New Workspace",
    })
    assert forbidden.status_code == 403


def test_chat_retrieval_never_uses_another_tenants_documents(client, monkeypatch):
    client, session_factory = client
    owner_a = register(client, "a@example.com", "Workspace A")
    owner_b = register(client, "b@example.com", "Workspace B")
    with session_factory() as db:
        db.add_all([
            DocumentChunk(
                tenant_id=owner_a["user"]["tenant_id"],
                filename="a.pdf",
                content="Workspace A private policy.",
                embedding=[1.0] * 768,
            ),
            DocumentChunk(
                tenant_id=owner_b["user"]["tenant_id"],
                filename="b.pdf",
                content="Workspace B private policy.",
                embedding=[1.0] * 768,
            ),
        ])
        db.commit()
    monkeypatch.setattr(main, "embed_text", AsyncMock(return_value=[1.0] * 768))
    monkeypatch.setattr(main, "ollama_chat_with_usage", AsyncMock(return_value={
        "answer": "Here is the answer.",
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "latency_ms": 10,
        "estimated_cost_usd": 0.0,
    }))

    response = client.post("/api/chat", headers=auth_headers(owner_a), json={
        "message": "What is my policy?",
    })
    assert response.status_code == 200
    assert [source["filename"] for source in response.json()["sources"]] == ["a.pdf"]
