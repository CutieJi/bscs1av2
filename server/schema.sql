-- ==============================================================================
-- MISLend Database Schema for Supabase PostgreSQL
-- ==============================================================================
-- Primary Key & Auto-Increment Convention:
-- All tables use "id" BIGSERIAL PRIMARY KEY (Auto-Incrementing Integer).
-- Entity-specific and relational foreign keys (users_id / user_id, equipment_id,
-- borrowing_id, incident_id) are provided for relational integrity & compatibility.
-- ==============================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. USERS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "users" (
    "id" BIGSERIAL PRIMARY KEY,
    "users_id" TEXT UNIQUE,
    "email" TEXT UNIQUE NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "middleInitial" TEXT,
    "lastName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "studentId" TEXT,
    "student_id" TEXT,
    "facultyId" TEXT,
    "faculty_id" TEXT,
    "adminId" TEXT,
    "admin_id" TEXT,
    "course" TEXT,
    "department" TEXT,
    "yearLevel" TEXT,
    "year_level" TEXT,
    "section" TEXT,
    "yearSection" TEXT,
    "year_section" TEXT,
    "mobile" TEXT,
    "phone_number" TEXT,
    "gender" TEXT,
    "photoURL" TEXT,
    "photo_url" TEXT,
    "isHeadAdmin" BOOLEAN DEFAULT false,
    "suspendedAt" TIMESTAMPTZ,
    "unsuspendedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist for retrofitting
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "users_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "student_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "faculty_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_id" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photoURL" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isHeadAdmin" BOOLEAN DEFAULT false;

-- ------------------------------------------------------------------------------
-- 2. EQUIPMENT TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "equipment" (
    "id" BIGSERIAL PRIMARY KEY,
    "equipment_id" TEXT,
    "equipmentId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "serial_number" TEXT,
    "assetNumber" TEXT,
    "asset_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "condition" TEXT DEFAULT 'Good',
    "location" TEXT,
    "description" TEXT,
    "photoURL" TEXT,
    "photo_url" TEXT,
    "totalQuantity" INTEGER DEFAULT 1,
    "total_quantity" INTEGER DEFAULT 1,
    "availableQuantity" INTEGER DEFAULT 1,
    "available_quantity" INTEGER DEFAULT 1,
    "qrCode" TEXT,
    "qr_code" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure equipment columns and indexes
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "equipment_id" TEXT;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "equipmentId" TEXT;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "photoURL" TEXT;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "borrowedBy" TEXT;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "borrowedAt" TIMESTAMPTZ;

UPDATE "equipment"
SET "equipmentId" = COALESCE(NULLIF("equipmentId", ''), NULLIF("equipment_id", ''), NULLIF("assetNumber", ''), CAST("id" AS TEXT)),
    "equipment_id" = COALESCE(NULLIF("equipment_id", ''), NULLIF("equipmentId", ''), CAST("id" AS TEXT))
WHERE "equipmentId" IS NULL OR "equipmentId" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "equipment_equipmentId_unique"
    ON "equipment" ("equipmentId");

-- ------------------------------------------------------------------------------
-- 3. BORROWINGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "borrowings" (
    "id" BIGSERIAL PRIMARY KEY,
    "borrowings_id" TEXT,
    "user_id" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
    "equipment_id" BIGINT REFERENCES "equipment"("id") ON DELETE SET NULL,
    "userId" TEXT,
    "equipmentId" TEXT,
    "submissionId" TEXT,
    "equipmentName" TEXT,
    "equipmentCategory" TEXT,
    "userName" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "studentId" TEXT,
    "facultyId" TEXT,
    "borrowDate" TEXT,
    "returnDate" TEXT,
    "borrowTime" TEXT,
    "expectedReturnTime" TEXT,
    "actualReturnTime" TEXT,
    "requestedReturnTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_borrow',
    "purpose" TEXT,
    "room" TEXT,
    "subject" TEXT,
    "professor" TEXT,
    "conditionOnBorrow" TEXT,
    "conditionOnReturn" TEXT,
    "returnNotes" TEXT,
    "pendingReturnCondition" TEXT,
    "pendingReturnNotes" TEXT,
    "extensionReason" TEXT,
    "studentIdPhoto" TEXT,
    "studentIdPhotoCapturedAt" TIMESTAMPTZ,
    "studentIdPhotoCapturedBy" TEXT,
    "studentIdPhotoCapturedByName" TEXT,
    "borrowedAt" TIMESTAMPTZ,
    "returnedAt" TIMESTAMPTZ,
    "lastNotified" TIMESTAMPTZ,
    "rejectionReason" TEXT,
    "wasOverdue" BOOLEAN DEFAULT false,
    "hasExtension" BOOLEAN DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMPTZ,
    "releasedBy" TEXT,
    "releasedByName" TEXT,
    "releasedAt" TIMESTAMPTZ,
    "extensionApprovedAt" TIMESTAMPTZ,
    "extensionApprovedBy" TEXT,
    "notificationCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "borrowings_id" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "equipment_id" BIGINT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "wasOverdue" BOOLEAN DEFAULT false;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "hasExtension" BOOLEAN DEFAULT false;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "equipmentCode" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "userMobile" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "userPhotoURL" TEXT;

-- ------------------------------------------------------------------------------
-- 4. INCIDENTS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "incidents" (
    "id" BIGSERIAL PRIMARY KEY,
    "incidents_id" TEXT,
    "borrowing_id" BIGINT REFERENCES "borrowings"("id") ON DELETE SET NULL,
    "equipment_id" BIGINT REFERENCES "equipment"("id") ON DELETE SET NULL,
    "user_id" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
    "borrowingId" TEXT,
    "equipmentId" TEXT,
    "equipmentName" TEXT,
    "reportedBy" TEXT,
    "reporterName" TEXT,
    "reporterEmail" TEXT,
    "reporterRole" TEXT,
    "type" TEXT,
    "severity" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "description" TEXT,
    "photos" JSONB DEFAULT '[]'::jsonb,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
    "approvedAt" TIMESTAMPTZ
);

ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "incidents_id" TEXT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "borrowing_id" BIGINT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "equipment_id" BIGINT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "reporterId" TEXT;

-- ------------------------------------------------------------------------------
-- 5. MESSAGES TABLE (Incidents Chat)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "messages" (
    "id" BIGSERIAL PRIMARY KEY,
    "messages_id" TEXT,
    "incident_id" BIGINT REFERENCES "incidents"("id") ON DELETE CASCADE,
    "user_id" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
    "incidentId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT,
    "senderRole" TEXT,
    "text" TEXT DEFAULT '',
    "message" TEXT,
    "timestamp" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "messages_id" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "incident_id" BIGINT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "message" TEXT;

-- ------------------------------------------------------------------------------
-- 6. FEEDBACK TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "feedback" (
    "id" BIGSERIAL PRIMARY KEY,
    "feedback_id" TEXT,
    "user_id" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
    "fullName" TEXT,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "message" TEXT,
    "overallRating" TEXT,
    "status" TEXT DEFAULT 'new-feedback',
    "timestamp" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "feedback_id" TEXT;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;

-- ------------------------------------------------------------------------------
-- 7. ADMIN AUDIT LOGS TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
    "id" BIGSERIAL PRIMARY KEY,
    "admin_audit_logs_id" TEXT,
    "user_id" BIGINT REFERENCES "users"("id") ON DELETE SET NULL,
    "action" TEXT,
    "adminId" TEXT,
    "targetUid" TEXT,
    "details" JSONB DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "admin_audit_logs_id" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN IF NOT EXISTS "user_id" BIGINT;

-- Disable Row Level Security (RLS) for backend access
ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "equipment" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "borrowings" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "incidents" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "feedback" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_audit_logs" DISABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- SEED DATA: Demo Accounts & Sample Equipment
-- ==============================================================================

-- 1. Default Admin Account (admin@cs1a.com / admin123)
INSERT INTO "users" (
    "id", "users_id", "email", "password", "name", "firstName", "lastName", "role", "status", "adminId", "isHeadAdmin"
) VALUES (
    1,
    'admin_demo_01',
    'admin@cs1a.com',
    '$2a$10$yreAgMQUmBHnIfdwlsbK/eL1bkDKYmvPcW2NQ5aFV.0gBVcZtw7Qa',
    'System Administrator',
    'System',
    'Administrator',
    'admin',
    'approved',
    'admin',
    true
) ON CONFLICT ("id") DO UPDATE SET
    "users_id" = EXCLUDED."users_id",
    "email" = EXCLUDED."email",
    "name" = EXCLUDED."name";

-- 2. Demo Student Account (roshjingel@gmail.com / @UCCIAN2025@)
INSERT INTO "users" (
    "id", "users_id", "email", "password", "name", "firstName", "lastName", "role", "status", "studentId", "course", "yearLevel", "section", "yearSection", "mobile", "gender"
) VALUES (
    2,
    'student_demo_01',
    'roshjingel@gmail.com',
    '$2a$10$1vPbKG/O.b1bFtBBeDtVO.ToZnIZFASWdGJnLG9PMmcA6sKzqZvM6',
    'Rosh Jingel',
    'Rosh',
    'Jingel',
    'student',
    'approved',
    '20251234-S',
    'BSCS',
    '1',
    'A',
    '1-A',
    '09123456789',
    'Male'
) ON CONFLICT ("id") DO UPDATE SET
    "users_id" = EXCLUDED."users_id",
    "email" = EXCLUDED."email",
    "name" = EXCLUDED."name";

-- 3. Demo Professor Account (prof@cs1a.com / admin123)
INSERT INTO "users" (
    "id", "users_id", "email", "password", "name", "firstName", "lastName", "role", "status", "facultyId", "department", "mobile", "gender"
) VALUES (
    3,
    'prof_demo_01',
    'prof@cs1a.com',
    '$2a$10$yreAgMQUmBHnIfdwlsbK/eL1bkDKYmvPcW2NQ5aFV.0gBVcZtw7Qa',
    'Prof. Roberto Santos',
    'Roberto',
    'Santos',
    'professor',
    'approved',
    'PROF-202501',
    'Computer Studies',
    '09187654321',
    'Male'
) ON CONFLICT ("id") DO UPDATE SET
    "users_id" = EXCLUDED."users_id",
    "email" = EXCLUDED."email",
    "name" = EXCLUDED."name";

-- Synchronize users sequence
SELECT setval(pg_get_serial_sequence('"users"', 'id'), COALESCE(max("id"), 3)) FROM "users";

-- 4. Sample Equipment Inventory
INSERT INTO "equipment" (
    "id", "equipment_id", "equipmentId", "name", "category", "model", "serialNumber", "assetNumber", "status", "condition", "location", "description", "totalQuantity", "availableQuantity"
) VALUES 
(
    1,
    'eq_lap_01',
    'AST-2025-001',
    'Dell Latitude 5420 Laptop',
    'Laptops',
    'Latitude 5420',
    'SN-DL-88231',
    'AST-2025-001',
    'available',
    'Good',
    'Lab 301, Cabinet A',
    'Intel Core i5 11th Gen, 16GB RAM, 512GB SSD for programming laboratory sessions.',
    5,
    5
),
(
    2,
    'eq_proj_01',
    'AST-2025-002',
    'Epson EB-X06 Projector',
    'Projectors',
    'EB-X06 XGA 3600 Lumens',
    'SN-EP-44109',
    'AST-2025-002',
    'available',
    'Good',
    'AVR Equipment Room',
    'High brightness 3600-lumen XGA 3LCD projector with HDMI and VGA inputs.',
    3,
    3
),
(
    3,
    'eq_ard_01',
    'AST-2025-003',
    'Arduino Uno R3 Ultimate Starter Kit',
    'Laboratory Kits',
    'Uno R3 Kit v2',
    'SN-ARD-10928',
    'AST-2025-003',
    'available',
    'Good',
    'Robotics & Embedded Lab',
    'Complete microcontroller starter kit with breadboard, sensors, jumper wires, and LCD module.',
    10,
    10
),
(
    4,
    'eq_cam_01',
    'AST-2025-004',
    'Canon EOS 3000D DSLR Camera Kit',
    'Audio/Visual',
    'EOS 3000D + 18-55mm',
    'SN-CN-76512',
    'AST-2025-004',
    'available',
    'Good',
    'Media Lab, Locker B',
    '18.0 MP APS-C CMOS sensor camera kit for multimedia projects and documentation.',
    2,
    2
)
ON CONFLICT ("id") DO UPDATE SET
    "equipment_id" = EXCLUDED."equipment_id",
    "equipmentId" = EXCLUDED."equipmentId",
    "name" = EXCLUDED."name";

-- Synchronize equipment sequence
SELECT setval(pg_get_serial_sequence('"equipment"', 'id'), COALESCE(max("id"), 4)) FROM "equipment";
