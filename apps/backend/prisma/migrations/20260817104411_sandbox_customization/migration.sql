-- AlterTable
ALTER TABLE "sandbox_templates" ADD COLUMN     "command" JSONB,
ADD COLUMN     "privileged" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "sandboxes" ADD COLUMN     "ttl_minutes" INTEGER;
