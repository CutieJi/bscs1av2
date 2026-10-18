ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "suspendedReason" TEXT;
