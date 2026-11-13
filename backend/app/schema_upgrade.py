import json

from sqlalchemy import inspect, text

from .config import EMBEDDING_DIMENSION
from .database import Base
from .models import (
    AuditLog, DocumentChunk, TeamInvitation, Tenant, TicketComment, User
)


LEGACY_COLUMNS = {
    "conversations": {
        "tenant_id": "INTEGER NOT NULL DEFAULT 1",
        "user_id": "INTEGER",
    },
    "tickets": {
        "tenant_id": "INTEGER NOT NULL DEFAULT 1",
        "created_by_id": "INTEGER",
        "assigned_to_id": "INTEGER",
        "customer_email": "VARCHAR(320)",
        "sentiment": "VARCHAR(30)",
        "suggested_category": "VARCHAR(80)",
        "suggested_priority": "VARCHAR(20)",
        "suggested_sentiment": "VARCHAR(30)",
        "suggestion_reason": "TEXT",
        "suggestion_status": "VARCHAR(20)",
    },
    "document_chunks": {
        "tenant_id": "INTEGER NOT NULL DEFAULT 1",
        "embedding": "JSON",
    },
}


def upgrade_schema(connection) -> None:
    if connection.dialect.name == "postgresql":
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    tables = set(inspect(connection).get_table_names())
    legacy_tables = tables.intersection(LEGACY_COLUMNS)
    if not legacy_tables:
        Base.metadata.create_all(bind=connection)
    else:
        Base.metadata.create_all(bind=connection, tables=[
            Tenant.__table__, User.__table__, TeamInvitation.__table__,
            TicketComment.__table__, AuditLog.__table__,
        ])
        for table_name in legacy_tables:
            columns = {column["name"] for column in inspect(connection).get_columns(table_name)}
            for name, definition in LEGACY_COLUMNS[table_name].items():
                if name not in columns:
                    if (table_name, name) == ("document_chunks", "embedding") and connection.dialect.name == "postgresql":
                        definition = f"vector({EMBEDDING_DIMENSION})"
                    connection.execute(text(
                        f'ALTER TABLE "{table_name}" ADD COLUMN "{name}" {definition}'
                    ))
        Base.metadata.create_all(bind=connection)

    if "tenants" in inspect(connection).get_table_names():
        tenant_columns = {column["name"] for column in inspect(connection).get_columns("tenants")}
        if "is_claimed" not in tenant_columns:
            connection.execute(text(
                'ALTER TABLE "tenants" ADD COLUMN "is_claimed" BOOLEAN NOT NULL DEFAULT false'
            ))

    connection.execute(text(
        "INSERT INTO tenants (id, name, created_at, is_claimed) "
        "SELECT 1, 'Unclaimed Workspace', CURRENT_TIMESTAMP, false "
        "WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE id = 1)"
    ))
    if connection.dialect.name == "postgresql":
        connection.execute(text(
            "SELECT setval(pg_get_serial_sequence('tenants', 'id'), "
            "(SELECT MAX(id) FROM tenants))"
        ))

    if "document_chunks" in legacy_tables:
        columns = {column["name"] for column in inspect(connection).get_columns("document_chunks")}
        if "embedding_json" in columns:
            rows = connection.execute(text(
                "SELECT id, embedding_json FROM document_chunks "
                "WHERE embedding IS NULL AND embedding_json IS NOT NULL"
            ))
            for chunk_id, raw_vector in rows:
                try:
                    vector = json.loads(raw_vector)
                except (TypeError, json.JSONDecodeError):
                    continue
                if len(vector) == EMBEDDING_DIMENSION:
                    connection.execute(
                        text("UPDATE document_chunks SET embedding = :vector WHERE id = :id"),
                        {"id": chunk_id, "vector": json.dumps(vector) if connection.dialect.name == "sqlite" else vector},
                    )
