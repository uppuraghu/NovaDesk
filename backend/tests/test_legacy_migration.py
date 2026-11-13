import json

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.dialects import postgresql

from app.models import DocumentChunk
from app.schema_upgrade import upgrade_schema


def test_legacy_sqlite_schema_is_migrated_without_dropping_records(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}", future=True)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE conversations (id INTEGER PRIMARY KEY, title VARCHAR(200), created_at DATETIME)"
        ))
        connection.execute(text(
            "CREATE TABLE messages (id INTEGER PRIMARY KEY, conversation_id INTEGER, role VARCHAR(20), content TEXT, created_at DATETIME)"
        ))
        connection.execute(text(
            "CREATE TABLE tickets (id INTEGER PRIMARY KEY, customer_name VARCHAR(120), subject VARCHAR(250), "
            "description TEXT, priority VARCHAR(20), status VARCHAR(30), category VARCHAR(80), "
            "created_at DATETIME, updated_at DATETIME)"
        ))
        connection.execute(text(
            "CREATE TABLE document_chunks (id INTEGER PRIMARY KEY, filename VARCHAR(255), page_number INTEGER, "
            "content TEXT, embedding_json TEXT, created_at DATETIME)"
        ))
        vector = [0.1] * 768
        connection.execute(text(
            "INSERT INTO tickets (id, customer_name, subject, description, priority, status, category) "
            "VALUES (7, 'Customer', 'Old ticket', 'Keep this row', 'medium', 'open', 'general')"
        ))
        connection.execute(text(
            "INSERT INTO document_chunks (id, filename, page_number, content, embedding_json) "
            "VALUES (4, 'old.pdf', 2, 'Original knowledge', :embedding)"
        ), {"embedding": json.dumps(vector)})
        upgrade_schema(connection)

    with engine.connect() as connection:
        ticket = connection.execute(text(
            "SELECT id, subject, tenant_id FROM tickets WHERE id = 7"
        )).one()
        chunk = connection.execute(text(
            "SELECT filename, tenant_id, embedding FROM document_chunks WHERE id = 4"
        )).one()
        assert ticket == (7, "Old ticket", 1)
        assert chunk.filename == "old.pdf"
        assert chunk.tenant_id == 1
        assert len(json.loads(chunk.embedding)) == 768
        assert "audit_logs" in inspect(connection).get_table_names()
    engine.dispose()


def test_postgres_retrieval_uses_pgvector_cosine_operator():
    statement = select(DocumentChunk.id).order_by(
        DocumentChunk.embedding.cosine_distance([0.0] * 768)
    )
    sql = str(statement.compile(dialect=postgresql.dialect()))
    assert "<=>" in sql
    assert "ORDER BY" in sql
