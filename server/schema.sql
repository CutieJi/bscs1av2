-- ==============================================================================
-- MISLend Database Schema for Supabase PostgreSQL
-- ==============================================================================
-- INSTRUCTIONS FOR SUPABASE:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project.
-- 3. Go to the "SQL Editor" tab on the left navigation.
-- 4. Click "New query", paste the entire contents of this file, and click "Run".
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "email" TEXT UNIQUE NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "middleInitial" TEXT,
    "lastName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'student',
    "status" TEXT NOT NULL DEFAULT 'approved',
    "studentId" TEXT,
    "facultyId" TEXT,
    "adminId" TEXT,
    "course" TEXT,
    "department" TEXT,
    "yearLevel" TEXT,
    "section" TEXT,
    "yearSection" TEXT,
    "mobile" TEXT,
    "gender" TEXT,
    "photoURL" TEXT,
    "isHeadAdmin" BOOLEAN DEFAULT false,
    "suspendedAt" TIMESTAMPTZ,
    "unsuspendedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure isHeadAdmin exists even if table was already created
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isHeadAdmin" BOOLEAN DEFAULT false;

-- 2. EQUIPMENT TABLE
CREATE TABLE IF NOT EXISTS "equipment" (
    "id" TEXT PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "assetNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "condition" TEXT DEFAULT 'Good',
    "location" TEXT,
    "description" TEXT,
    "photoURL" TEXT,
    "totalQuantity" INTEGER DEFAULT 1,
    "availableQuantity" INTEGER DEFAULT 1,
    "qrCode" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BORROWINGS TABLE
CREATE TABLE IF NOT EXISTS "borrowings" (
    "id" TEXT PRIMARY KEY,
    "submissionId" TEXT,
    "equipmentId" TEXT,
    "equipmentName" TEXT,
    "equipmentCategory" TEXT,
    "userId" TEXT,
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

-- Ensure borrowings columns exist even if table was already created
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "wasOverdue" BOOLEAN DEFAULT false;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "hasExtension" BOOLEAN DEFAULT false;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "releasedBy" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "releasedByName" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMPTZ;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "extensionApprovedAt" TIMESTAMPTZ;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "extensionApprovedBy" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "notificationCount" INTEGER DEFAULT 0;

-- 4. INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS "incidents" (
    "id" TEXT PRIMARY KEY,
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

-- 5. MESSAGES TABLE (Incidents Chat)
CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT PRIMARY KEY,
    "incidentId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT,
    "senderRole" TEXT,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ DEFAULT NOW()
);

-- 6. FEEDBACK TABLE (Contact page)
CREATE TABLE IF NOT EXISTS "feedback" (
    "id" TEXT PRIMARY KEY,
    "fullName" TEXT,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "message" TEXT,
    "overallRating" TEXT,
    "status" TEXT DEFAULT 'new-feedback',
    "timestamp" TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ADMIN AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
    "id" TEXT PRIMARY KEY,
    "action" TEXT,
    "adminId" TEXT,
    "targetUid" TEXT,
    "details" JSONB DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Disable Row Level Security (RLS) so the Node.js backend can perform standard operations,
-- or enable it if you prefer managing policies through Supabase.
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

-- 1. Default Admin Account (admin@cs1a.com / admin123, ID: admin)
INSERT INTO "users" (
    "id", "email", "password", "name", "firstName", "lastName", "role", "status", "adminId", "isHeadAdmin"
) VALUES (
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
) ON CONFLICT ("id") DO NOTHING;

-- 2. Demo Student Account (roshjingel@gmail.com / @UCCIAN2025@, ID: 20251234-S)
INSERT INTO "users" (
    "id", "email", "password", "name", "firstName", "lastName", "role", "status", "studentId", "course", "yearLevel", "section", "yearSection", "mobile", "gender"
) VALUES (
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
) ON CONFLICT ("id") DO NOTHING;

-- 3. Demo Professor Account (prof@cs1a.com / admin123, ID: PROF-202501)
INSERT INTO "users" (
    "id", "email", "password", "name", "firstName", "lastName", "role", "status", "facultyId", "department", "mobile", "gender"
) VALUES (
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
) ON CONFLICT ("id") DO NOTHING;

-- 4. Sample Equipment Inventory
INSERT INTO "equipment" (
    "id", "name", "category", "model", "serialNumber", "assetNumber", "status", "condition", "location", "description", "totalQuantity", "availableQuantity"
) VALUES 
(
    'eq_lap_01',
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
    'eq_proj_01',
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
    'eq_ard_01',
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
    'eq_cam_01',
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
ON CONFLICT ("id") DO NOTHING;
