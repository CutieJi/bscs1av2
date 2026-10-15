ALTER TABLE "incidents"
    ADD COLUMN IF NOT EXISTS "reporterId_number" TEXT,
    ADD COLUMN IF NOT EXISTS "reporterMobile" TEXT,
    ADD COLUMN IF NOT EXISTS "reporterDepartment" TEXT,
    ADD COLUMN IF NOT EXISTS "equipmentCode" TEXT,
    ADD COLUMN IF NOT EXISTS "equipmentCategory" TEXT,
    ADD COLUMN IF NOT EXISTS "incidentType" TEXT,
    ADD COLUMN IF NOT EXISTS "incidentDate" TEXT,
    ADD COLUMN IF NOT EXISTS "incidentTime" TEXT,
    ADD COLUMN IF NOT EXISTS "location" TEXT,
    ADD COLUMN IF NOT EXISTS "actionTaken" TEXT,
    ADD COLUMN IF NOT EXISTS "witnesses" TEXT,
    ADD COLUMN IF NOT EXISTS "declarationAccepted" BOOLEAN,
    ADD COLUMN IF NOT EXISTS "photoURL" TEXT;
