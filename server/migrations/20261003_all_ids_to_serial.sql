-- ==============================================================================
-- Migration: Convert ALL tables' id from TEXT to auto-incrementing BIGSERIAL
-- ==============================================================================
-- Run this in the Supabase SQL Editor.
--
-- This converts the "id" column of every table from TEXT to BIGSERIAL
-- so IDs auto-increment as 1, 2, 3, 4, ...
--
-- Tables affected:
--   1. users
--   2. equipment
--   3. borrowings
--   4. incidents
--   5. messages
--   6. feedback
--   7. admin_audit_logs
-- ==============================================================================

-- ============================================================
-- STEP 1: Drop ALL foreign key constraints first
-- (child tables reference parent tables, so drop children first)
-- ============================================================

-- messages -> incidents(id), users(id)
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS messages_incident_id_fkey;
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS messages_user_id_fkey;

-- feedback -> users(id)
ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS feedback_user_id_fkey;

-- admin_audit_logs -> users(id)
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT IF EXISTS admin_audit_logs_user_id_fkey;

-- incidents -> borrowings(id), equipment(id), users(id)
ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS incidents_borrowing_id_fkey;
ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS incidents_equipment_id_fkey;
ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS incidents_user_id_fkey;

-- borrowings -> users(id), equipment(id)
ALTER TABLE "borrowings" DROP CONSTRAINT IF EXISTS borrowings_user_id_fkey;
ALTER TABLE "borrowings" DROP CONSTRAINT IF EXISTS borrowings_equipment_id_fkey;


-- ============================================================
-- STEP 2: Convert each table's "id" column to BIGSERIAL
-- ============================================================

-- ---------- 1. USERS ----------
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE "users" DROP COLUMN "id";
ALTER TABLE "users" ADD COLUMN "id" BIGSERIAL PRIMARY KEY;

-- ---------- 2. EQUIPMENT ----------
ALTER TABLE "equipment" DROP CONSTRAINT IF EXISTS equipment_pkey;
ALTER TABLE "equipment" DROP COLUMN "id";
ALTER TABLE "equipment" ADD COLUMN "id" BIGSERIAL PRIMARY KEY;

-- ---------- 3. BORROWINGS ----------
ALTER TABLE "borrowings" DROP CONSTRAINT IF EXISTS borrowings_pkey;
ALTER TABLE "borrowings" DROP COLUMN "id";
ALTER TABLE "borrowings" ADD COLUMN "id" BIGSERIAL PRIMARY KEY;

-- ---------- 4. INCIDENTS ----------
ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS incidents_pkey;
ALTER TABLE "incidents" DROP COLUMN "id";
ALTER TABLE "incidents" ADD COLUMN "id" BIGSERIAL PRIMARY KEY;

-- ---------- 5. MESSAGES ----------
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS messages_pkey;
ALTER TABLE "messages" DROP COLUMN "id";
ALTER TABLE "messages" ADD COLUMN "id" BIGSERIAL PRIMARY KEY;

-- ---------- 6. FEEDBACK ----------
ALTER TABLE "feedback" DROP CONSTRAINT IF EXISTS feedback_pkey;
ALTER TABLE "feedback" DROP COLUMN "id";
ALTER TABLE "feedback" ADD COLUMN "id" BIGSERIAL PRIMARY KEY;

-- ---------- 7. ADMIN_AUDIT_LOGS ----------
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT IF EXISTS admin_audit_logs_pkey;
ALTER TABLE "admin_audit_logs" DROP COLUMN "id";
ALTER TABLE "admin_audit_logs" ADD COLUMN "id" BIGSERIAL PRIMARY KEY;


-- ============================================================
-- STEP 3 (Optional): Restore foreign key constraints
-- ============================================================
-- Uncomment these if your tables had FK constraints and you want to re-add them.
-- Note: The BIGINT FK columns (user_id, equipment_id, etc.) will need to be
-- re-populated with the new integer IDs if you want referential integrity.
--
-- ALTER TABLE "borrowings" ADD CONSTRAINT borrowings_user_id_fkey
--     FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
-- ALTER TABLE "borrowings" ADD CONSTRAINT borrowings_equipment_id_fkey
--     FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE SET NULL;
--
-- ALTER TABLE "incidents" ADD CONSTRAINT incidents_borrowing_id_fkey
--     FOREIGN KEY ("borrowing_id") REFERENCES "borrowings"("id") ON DELETE SET NULL;
-- ALTER TABLE "incidents" ADD CONSTRAINT incidents_equipment_id_fkey
--     FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE SET NULL;
-- ALTER TABLE "incidents" ADD CONSTRAINT incidents_user_id_fkey
--     FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--
-- ALTER TABLE "messages" ADD CONSTRAINT messages_incident_id_fkey
--     FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE;
-- ALTER TABLE "messages" ADD CONSTRAINT messages_user_id_fkey
--     FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--
-- ALTER TABLE "feedback" ADD CONSTRAINT feedback_user_id_fkey
--     FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--
-- ALTER TABLE "admin_audit_logs" ADD CONSTRAINT admin_audit_logs_user_id_fkey
--     FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;

-- Done! All tables now use auto-incrementing integer IDs: 1, 2, 3, 4, ...
