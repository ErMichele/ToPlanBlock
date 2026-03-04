/* Query to fetch data for the first 5 users for checking purposes.
   This shows the Username, Task, and the associated Category name.
*/

SELECT 
    u.id AS user_id, 
    u.username, 
    t.task, 
    t.completed,
    c.name AS category_name
FROM "user" u
LEFT JOIN todo t ON u.id = t.user_id
LEFT JOIN todo_category tc ON t.id = tc.todo_id
LEFT JOIN category c ON tc.category_id = c.id
WHERE u.id IN (
    SELECT id FROM "user" ORDER BY id ASC LIMIT 5
)
ORDER BY u.id ASC, t.id ASC;