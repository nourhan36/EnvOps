import { Router } from "express";
import { getTemplates } from "../controllers/template.controller";

const router = Router();

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: Get all sandbox templates
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Sandbox templates returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SandboxTemplate'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", getTemplates);

export default router;
