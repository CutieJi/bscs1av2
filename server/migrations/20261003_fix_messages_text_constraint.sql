-- ==============================================================================
-- Migration: Add missing columns and fix NOT NULL constraint on messages table
-- ==============================================================================
-- Run this in the Supabase SQL Editor.
-- ==============================================================================

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "message" TEXT;
ALTER TABLE "messages" ALTER COLUMN "text" DROP NOT NULL;
ALTER TABLE "incidents" ADD COLUMN IF NOT EXISTS "reporterId" TEXT;
