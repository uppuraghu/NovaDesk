from alembic import op

from app.schema_upgrade import upgrade_schema

revision = "20261113_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    upgrade_schema(op.get_bind())


def downgrade():
    raise RuntimeError("The initial schema migration is intentionally irreversible")
