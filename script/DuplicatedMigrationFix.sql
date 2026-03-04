/* This script is intended to fix the issue (#3).
   Since in the app we fixed future category names in uppercase, we need to clean up the existing data to match this new standard.
   So the script will:
    1. Identify duplicate categories that differ only by case (e.g., "github", "GITHUB", " gitHUb", etc.);
    2. Update all tasks linked to the non-master categories to point to the master category (the one with the smallest ID);
    3. Delete the old links from the middle table;
    4. Delete the duplicate categories;
    5. Finally, rename all remaining categories to UPPERCASE to ensure consistency.
*/

-- 1. Create a persistent temporary table for the session
DROP TABLE IF EXISTS category_cleanup_map;
CREATE TEMP TABLE category_cleanup_map AS
SELECT 
    id AS original_id,
    name AS original_name,
    FIRST_VALUE(id) OVER (PARTITION BY UPPER(TRIM(name)) ORDER BY id ASC) AS target_id
FROM category;

-- 2. Link tasks to the new "Master" IDs
INSERT INTO todo_category (todo_id, category_id)
SELECT tc.todo_id, ccm.target_id
FROM todo_category tc
JOIN category_cleanup_map ccm ON tc.category_id = ccm.original_id
WHERE ccm.original_id <> ccm.target_id
ON CONFLICT DO NOTHING;

-- 3. Delete the old links from the middle table
DELETE FROM todo_category 
WHERE category_id IN (
    SELECT original_id FROM category_cleanup_map WHERE original_id <> target_id
);

-- 4. Delete the duplicate categories
DELETE FROM category 
WHERE id IN (
    SELECT original_id FROM category_cleanup_map WHERE original_id <> target_id
);

-- 5. Finally, rename all remaining categories to UPPERCASE
UPDATE category
SET name = UPPER(TRIM(name));

-- Show results
SELECT * FROM category ORDER BY name;