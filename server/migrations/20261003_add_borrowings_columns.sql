-- ==============================================================================
-- Migration: Add missing borrowing columns to Supabase
-- ==============================================================================
-- Run this in the Supabase SQL Editor if you get missing column warnings.
-- ==============================================================================

ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "equipmentCode" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "userMobile" TEXT;
ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "userPhotoURL" TEXT;
