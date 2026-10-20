ALTER TABLE "borrowings"
    ADD COLUMN IF NOT EXISTS "activityHistory" JSONB NOT NULL DEFAULT '[]'::jsonb;

