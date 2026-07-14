import { Router } from "express";
import {
    createSandbox,
    getSandboxes,
    getSandbox,
    deleteSandbox
} from "../controllers/sandbox.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth } from "../middlewares/auth.middleware";
import { createSandboxSchema, sandboxIdParamSchema } from "../schema/sandbox.schema";

const router = Router();

// Apply auth middleware to all sandbox routes
router.use(requireAuth);

router.get("/", getSandboxes);

router.get("/:id", validate(sandboxIdParamSchema), getSandbox);

router.post("/", validate(createSandboxSchema), createSandbox);

router.delete("/:id", validate(sandboxIdParamSchema), deleteSandbox);

export default router;