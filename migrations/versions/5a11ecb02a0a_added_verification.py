"""Add is_verified column and auto-verify existing accounts

Revision ID: 5a11ecb02a0a
Revises: b5fe38b4a01b
Create Date: 2026-11-19 08:38:55.728327

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5a11ecb02a0a'
down_revision = 'b5fe38b4a01b'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add the column allowing nulls initially so we can populate existing rows
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_verified', sa.Boolean(), nullable=True))

    # 2. Automatically verify all accounts already registered upon migration
    op.execute("UPDATE \"user\" SET is_verified = TRUE WHERE is_verified IS NULL")

    # 3. Alter the column to be NOT NULL now that all records are populated
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.alter_column('is_verified', existing_type=sa.Boolean(), nullable=False)


def downgrade():
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('is_verified')