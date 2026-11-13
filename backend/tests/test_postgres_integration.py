import pytest
from sqlalchemy.orm import Session

from app.database import engine
from app.models import DocumentChunk, Tenant


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Requires PostgreSQL with pgvector")
def test_postgres_tenant_scoped_cosine_search():
    query_vector = [1.0] + [0.0] * 767
    near_vector = [0.9, 0.1] + [0.0] * 766
    far_vector = [0.0, 1.0] + [0.0] * 766

    with Session(engine) as db:
        tenant = Tenant(name="pgvector-test", is_claimed=True)
        db.add(tenant)
        db.flush()
        db.add_all([
            DocumentChunk(
                tenant_id=tenant.id,
                filename="near.txt",
                content="nearest passage",
                embedding=near_vector,
            ),
            DocumentChunk(
                tenant_id=tenant.id,
                filename="far.txt",
                content="far passage",
                embedding=far_vector,
            ),
        ])
        db.commit()
        try:
            ranked = db.query(
                DocumentChunk,
                DocumentChunk.embedding.cosine_distance(query_vector).label("distance"),
            ).filter(
                DocumentChunk.tenant_id == tenant.id,
                DocumentChunk.embedding.isnot(None),
            ).order_by("distance").limit(2).all()
            assert [chunk.filename for chunk, _ in ranked] == ["near.txt", "far.txt"]
        finally:
            db.query(DocumentChunk).filter(DocumentChunk.tenant_id == tenant.id).delete()
            db.delete(tenant)
            db.commit()
