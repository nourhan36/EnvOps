-- Allow templates to declare pod environment variables (JSON array of
-- { name, value } pairs) required by runtime entrypoints (postgres, mysql).
ALTER TABLE "sandbox_templates" ADD COLUMN "env" JSONB;