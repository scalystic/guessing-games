-- Replace the original adult-only bounds with the age range used by the
-- onboarding and signup sliders.
ALTER TABLE "Player" DROP CONSTRAINT "Player_declaredAge_check";

ALTER TABLE "Player"
ADD CONSTRAINT "Player_declaredAge_check"
CHECK ("declaredAge" IS NULL OR "declaredAge" BETWEEN 5 AND 80);
