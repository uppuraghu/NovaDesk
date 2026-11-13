import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy.orm import Session

from .ai import embed_text
from .database import Base, engine
from .models import DocumentChunk

FIXTURES = Path(__file__).parent.parent / "evaluation" / "fixtures.json"


async def seed(tenant_id: int) -> int:
    passages = json.loads(FIXTURES.read_text(encoding="utf-8"))
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        added = 0
        for passage in passages:
            db.query(DocumentChunk).filter(
                DocumentChunk.tenant_id == tenant_id,
                DocumentChunk.filename == passage["filename"],
            ).delete()
            vector = await embed_text(passage["content"])
            db.add(DocumentChunk(
                tenant_id=tenant_id,
                filename=passage["filename"],
                page_number=1,
                content=passage["content"],
                embedding=vector,
            ))
            added += 1
        db.commit()
        return added


def main():
    parser = argparse.ArgumentParser(description="Index sample policies for the AI evaluation suite.")
    parser.add_argument("--tenant-id", type=int, required=True)
    tenant_id = parser.parse_args().tenant_id
    print(f"Indexed {asyncio.run(seed(tenant_id))} evaluation passages for tenant {tenant_id}.")


if __name__ == "__main__":
    main()
