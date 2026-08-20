-- Create the security mode enum and replace the boolean "privileged" flag.
CREATE TYPE "SecurityMode" AS ENUM ('hardened', 'root', 'privileged');

-- sandbox_templates: add the new column, backfill from the legacy boolean,
-- then drop the old column.
ALTER TABLE "sandbox_templates" ADD COLUMN "security_mode" "SecurityMode" NOT NULL DEFAULT 'hardened';

UPDATE "sandbox_templates" SET "security_mode" = 'privileged' WHERE "privileged" = true;

ALTER TABLE "sandbox_templates" DROP COLUMN "privileged";

-- sandboxes: record the effective security posture applied at provision time.
ALTER TABLE "sandboxes" ADD COLUMN "security_mode" "SecurityMode" NOT NULL DEFAULT 'hardened';