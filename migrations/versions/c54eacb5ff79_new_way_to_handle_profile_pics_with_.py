"""New way to handle profile_pics with only ids

Revision ID: c54eacb5ff79
Revises: ee70939fad38
Create Date: 2026-05-01 15:18:07.305694
"""
from alembic import op
import sqlalchemy as sa
import cloudinary.uploader
import os

revision = 'c54eacb5ff79'
down_revision = 'ee70939fad38'
branch_labels = None
depends_on = None

def upgrade():
    # 1. Add the new column
    op.add_column('user', sa.Column('profile_pic_id', sa.String(length=100), nullable=True))

    # 2. Setup connection and get folder info [cite: 1]
    connection = op.get_bind()
    branch = os.getenv('BRANCH', 'dev')
    target_folder = f"ToPlanBlock/{branch}/profile_pics"

    # 3. Fetch users with old URLs
    users = connection.execute(sa.text("SELECT id, profile_pic_url FROM \"user\" WHERE profile_pic_url IS NOT NULL")).fetchall()
    
    for user_id, url in users:
        if 'cloudinary.com' in url:
            try:
                # Extract old public_id (e.g., 'profile_pics/user_123')
                path_part = url.split('/upload/')[1].split('/', 1)[1]
                old_public_id = path_part.rsplit('.', 1)[0]
                
                # Define new filename and path
                filename = old_public_id.split('/')[-1]
                new_public_id = f"{target_folder}/{filename}"

                # MOVE file on Cloudinary
                cloudinary.uploader.rename(old_public_id, new_public_id)

                # Update DB with just the filename
                connection.execute(
                    sa.text("UPDATE \"user\" SET profile_pic_id = :id WHERE id = :user_id"),
                    {"id": filename, "user_id": user_id}
                )
            except Exception as e:
                print(f"Migration error for user {user_id}: {e}")

    # 4. Drop the old column
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('profile_pic_url')


def downgrade():
    # 1. Add the old column back
    op.add_column('user', sa.Column('profile_pic_url', sa.String(length=500), nullable=True))

    connection = op.get_bind()
    cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
    branch = os.getenv('BRANCH', 'dev')
    target_folder = f"ToPlanBlock/{branch}/profile_pics"
    
    # 2. Fetch IDs to reconstruct URLs
    users = connection.execute(sa.text("SELECT id, profile_pic_id FROM \"user\" WHERE profile_pic_id IS NOT NULL")).fetchall()
    
    for user_id, pic_id in users:
        # Result example: https://res.cloudinary.com/dz3ck8cob/image/upload/ToPlanBlock/dev/profile_pics/user_1.jpg
        full_url = f"https://res.cloudinary.com/{cloud_name}/image/upload/{target_folder}/{pic_id}"
        
        connection.execute(
            sa.text("UPDATE \"user\" SET profile_pic_url = :url WHERE id = :user_id"),
            {"url": full_url, "user_id": user_id}
        )

    # 3. Drop the new ID column
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('profile_pic_id')