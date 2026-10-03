-- ==============================================================================
-- Migration: Add Relational ID & Table-Specific ID Columns
-- ==============================================================================
-- Run this in the Supabase SQL Editor if you have existing tables created earlier.
-- ==============================================================================

-- 1. USERS
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "users_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "student_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "faculty_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photoURL" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isHeadAdmin" BOOLEAN DEFAULT false;
UPDATE "users" SET "users_id" = CAST("id" AS TEXT) WHERE "users_id" IS NULL;

-- 2. EQUIPMENT
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "equipment_id" TEXT;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "equipmentId" TEXT;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "photoURL" TEXT;
UPDATE "equipment" 
SET "equipmentId" = COALESCE(NULLIF("equipmentId", ''), NULLIF("equipment_id", ''), NULLIF("assetNumber", ''), CAST("id" AS TEXT)),
    "equipment_id" = COALESCE(NULLIF("equipment_id", ''), NULLIF("equipmentId", ''), CAST("id" AS TEXT))
WHERE "equipment_id" IS NULL OR "equipmentId" IS NULL;

-- 3. BORROWINGS
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "borrowings_id" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "equipment_id" BIGINT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "wasOverdue" BOOLEAN DEFAULT false;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "hasExtension" BOOLEAN DEFAULT false;
UPDATE "borrowings" SET "borrowings_id" = CAST("id" AS TEXT) WHERE "borrowings_id" IS NULL;

-- 4. INCIDENTS
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "incidents_id" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "borrowing_id" BIGINT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "equipment_id" BIGINT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;
UPDATE "incidents" SET "incidents_id" = CAST("id" AS TEXT) WHERE "incidents_id" IS NULL;

-- 5. MESSAGES
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "messages_id" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "incident_id" BIGINT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;
UPDATE "messages" SET "messages_id" = CAST("id" AS TEXT) WHERE "messages_id" IS NULL;

-- 6. FEEDBACK
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "feedback_id" TEXT;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;
UPDATE "feedback" SET "feedback_id" = CAST("id" AS TEXT) WHERE "feedback_id" IS NULL;

-- 7. ADMIN AUDIT LOGS
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "admin_audit_logs_id" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;
UPDATE "admin_audit_logs" SET "admin_audit_logs_id" = CAST("id" AS TEXT) WHERE "admin_audit_logs_id" IS NULL;
