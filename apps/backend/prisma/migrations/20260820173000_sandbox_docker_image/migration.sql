-- AlterTable
ALTER TABLE "sandboxes" DROP CONSTRAINT "sandboxes_template_id_fkey";
ALTER TABLE "sandboxes" ALTER COLUMN "template_id" DROP NOT NULL;
ALTER TABLE "sandboxes" ADD COLUMN "docker_image" TEXT;
ALTER TABLE "sandboxes" ADD CONSTRAINT "sandboxes_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "sandbox_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;