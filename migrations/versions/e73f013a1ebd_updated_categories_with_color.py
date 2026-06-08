"""Updated categories with color

Revision ID: e73f013a1ebd
Revises: 672d4ef03bca
Create Date: 2026-05-19 08:59:39.326489

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e73f013a1ebd'
down_revision = '672d4ef03bca'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add the new columns as nullable first
    op.add_column('category', sa.Column('color', sa.String(length=7), nullable=True))
    op.add_column('category', sa.Column('user_id', sa.Integer(), nullable=True))

    connection = op.get_bind()
    
    # Safely fetch the first available user ID
    user = connection.execute(sa.text("SELECT id FROM \"user\" LIMIT 1")).fetchone()
    fallback_user_id = user[0] if user else 1

    # 2. Clean up data: convert any old default hexes or empty strings to database NULL
    connection.execute(
        sa.text("UPDATE category SET color = NULL WHERE color = '#0d6efd' OR color = ''")
    )
    connection.execute(
        sa.text("UPDATE category SET user_id = :user_id WHERE user_id IS NULL"),
        {"user_id": fallback_user_id}
    )

    # 3. Enforce NOT NULL constraint only on user_id. Color safely stays nullable=True.
    with op.batch_alter_table('category', schema=None) as batch_op:
        batch_op.alter_column('user_id', nullable=False, existing_type=sa.Integer())
        
        batch_op.create_unique_constraint('_category_user_uc', ['name', 'user_id'])
        batch_op.create_foreign_key('category_user_id_fkey', 'user', ['user_id'], ['id'])
        batch_op.drop_constraint('category_name_key', type_='unique')


def downgrade():
    with op.batch_alter_table('category', schema=None) as batch_op:
        batch_op.create_unique_constraint('category_name_key', ['name'])
        batch_op.drop_constraint('category_user_id_fkey', type_='foreignkey')
        batch_op.drop_constraint('_category_user_uc', type_='unique')
        
        batch_op.drop_column('user_id')
        batch_op.drop_column('color')