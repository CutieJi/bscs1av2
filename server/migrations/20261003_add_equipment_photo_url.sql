-- Add photoURL column to equipment table if it doesn't already exist
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "photoURL" TEXT;
