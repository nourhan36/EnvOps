import { Router } from "express";

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check backend health
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Backend is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [status]
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default router;
