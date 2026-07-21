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

/**
 * @swagger
 * /api/sandboxes:
 *   get:
 *     summary: Get all user sandboxes
 *     tags:
 *       - Sandboxes
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user sandboxes
 *       401:
 *         description: Unauthorized
 */

router.get("/", getSandboxes);

/**
 * @swagger
 * /api/sandboxes/{id}:
 *   get:
 *     summary: Get sandbox by id
 *     tags:
 *       - Sandboxes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sandbox ID
 *     responses:
 *       200:
 *         description: Sandbox details returned successfully
 *       404:
 *         description: Sandbox not found
 *       401:
 *         description: Unauthorized
 */

router.get("/:id", validate(sandboxIdParamSchema), getSandbox);
/**
 * @swagger
 * /api/sandboxes:
 *   post:
 *     summary: Create a new sandbox
 *     tags:
 *       - Sandboxes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *             properties:
 *               templateId:
 *                 type: string
 *                 example: "31884bc3-86db-4687-8ee7-40abd578dafb"
 *     responses:
 *       201:
 *         description: Sandbox created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */

router.post("/", validate(createSandboxSchema), createSandbox);

/**
 * @swagger
 * /api/sandboxes/{id}:
 *   delete:
 *     summary: Delete a sandbox
 *     tags:
 *       - Sandboxes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Sandbox ID
 *     responses:
 *       200:
 *         description: Sandbox deleted successfully
 *       404:
 *         description: Sandbox not found
 *       401:
 *         description: Unauthorized
 */

router.delete("/:id", validate(sandboxIdParamSchema), deleteSandbox);

export default router;