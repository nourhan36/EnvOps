import { Request, Response } from "express";
import {
    createSandbox as createSandboxService,
    getAllSandboxes,
    getSandboxById,
    deleteSandbox as deleteSandboxService
} from "../services/sandbox.service";

export async function getSandboxes(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const sandboxes = await getAllSandboxes(userId);
    return res.json(sandboxes);
}

export async function getSandbox(req: Request<{ id: string }>, res: Response) {
    const userId = (req as any).user.id;
    const sandbox = await getSandboxById(req.params.id, userId);
    return res.json(sandbox);
}

export async function createSandbox(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const { templateId } = req.body;
    
    const sandbox = await createSandboxService(templateId, userId);

    return res.status(201).json({
        message: "Sandbox created successfully",
        sandbox
    });
}

export async function deleteSandbox(req: Request<{ id: string }>, res: Response) {
    const userId = (req as any).user.id;
    const sandbox = await deleteSandboxService(req.params.id, userId);

    return res.json({
        message: "Sandbox deleted successfully",
        sandbox
    });
}