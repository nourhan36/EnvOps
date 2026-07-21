import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller";

const router = Router();


/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     tags:
 *       - Dashboard
 *     responses:
 *       200:
 *         description: Dashboard metrics returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalSandboxes:
 *                   type: integer
 *                   example: 2
 *                 provisioningSandboxes:
 *                   type: integer
 *                   example: 0
 *                 runningSandboxes:
 *                   type: integer
 *                   example: 2
 *                 failedSandboxes:
 *                   type: integer
 *                   example: 0
 *                 totalTemplates:
 *                   type: integer
 *                   example: 1
 *       500:
 *         description: Internal server error
 */
router.get(
    "/",
    getDashboard
);


export default router;