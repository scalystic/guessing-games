-- AlterTable
ALTER TABLE "Player" ADD COLUMN "declaredAge" INTEGER;

-- Keep direct database writes subject to the same bounds as the signup and
-- onboarding forms. Existing users remain NULL until their next login.
ALTER TABLE "Player"
ADD CONSTRAINT "Player_declaredAge_check"
CHECK ("declaredAge" IS NULL OR "declaredAge" BETWEEN 18 AND 120);
