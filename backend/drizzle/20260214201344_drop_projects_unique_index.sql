-- Drop unique index on projects.user_id to allow multiple projects per user
DROP INDEX IF EXISTS "projects_user_id_idx";
