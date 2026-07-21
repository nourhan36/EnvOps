import { Router } from "express";
import { getTemplates } from "../controllers/template.controller";

const router = Router();

/**
 * @swagger
 * /api/templates:
 *   get:
 *     summary: Get all sandbox templates
 *     tags:
 *       - Templates
 *     responses:
 *       200:
 *         description: Successfully returned sandbox templates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   displayName:
 *                     type: string
 *                   description:
 *                     type: string
 *                   dockerImage:
 *                     type: string
 *                   defaultTtlMinutes:
 *                     type: integer
 */
router.get("/", getTemplates);

export default router;