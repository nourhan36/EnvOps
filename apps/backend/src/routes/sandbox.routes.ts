import { Router } from "express";
import {
  createSandbox,
  getSandboxes,
  getSandbox,
  deleteSandbox,
} from "../controllers/sandbox.controller";
import { validate } from "../middlewares/validate.middleware";
import { requireAuth } from "../middlewares/auth.middleware";
import {
  createSandboxSchema,
  sandboxIdParamSchema,
} from "../schema/sandbox.schema";

const router = Router();

// MVP authentication resolves the seeded demo user. Replace with JWT/session auth later.
router.use(requireAuth);

/**
 * @swagger
 * /api/sandboxes:
 *   get:
 *     summary: Get all sandboxes owned by the current user
 *     description: The current MVP resolves the seeded demo user automatically.
 *     tags: [Sandboxes]
 *     responses:
 *       200:
 *         description: User sandboxes returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Sandbox'
 *       401:
 *         description: The demo/authenticated user could not be resolved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", getSandboxes);

/**
 * @swagger
 * /api/sandboxes/{id}:
 *   get:
 *     summary: Get one sandbox owned by the current user
 *     tags: [Sandboxes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Sandbox database ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Sandbox returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Sandbox'
 *       400:
 *         description: Invalid sandbox ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Sandbox not found or not owned by the current user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", validate(sandboxIdParamSchema), getSandbox);

/**
 * @swagger
 * /api/sandboxes:
 *   post:
 *     summary: Create and provision a sandbox
 *     description: Creates the database record, Kubernetes Namespace, Service, and Pod, then waits for the Pod to reach Running.
 *     tags: [Sandboxes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSandboxRequest'
 *     responses:
 *       201:
 *         description: Sandbox provisioned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateSandboxResponse'
 *       400:
 *         description: Invalid request body
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Template not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Kubernetes provisioning or internal error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", validate(createSandboxSchema), createSandbox);

/**
 * @swagger
 * /api/sandboxes/{id}:
 *   delete:
 *     summary: Delete a sandbox and its Kubernetes Namespace
 *     tags: [Sandboxes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Sandbox database ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Sandbox deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DeleteSandboxResponse'
 *       400:
 *         description: Invalid sandbox ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Sandbox not found or not owned by the current user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Kubernetes deletion or internal error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", validate(sandboxIdParamSchema), deleteSandbox);

export default router;
