ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "equipmentId" TEXT;

UPDATE "equipment"
SET "equipmentId" = COALESCE(NULLIF("equipmentId", ''), NULLIF("assetNumber", ''), "id")
WHERE "equipmentId" IS NULL OR "equipmentId" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "equipment_equipmentId_unique"
    ON "equipment" ("equipmentId");
