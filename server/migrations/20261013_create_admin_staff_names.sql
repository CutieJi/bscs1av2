CREATE TABLE IF NOT EXISTS "admin_staff_names" (
    "id" BIGSERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "addedBy" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE "admin_staff_names" DISABLE ROW LEVEL SECURITY;
