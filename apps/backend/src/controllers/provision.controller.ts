import { Request, Response } from "express";
import { createSandboxFromPrompt as createSandboxFromPromptService } from "../services/sandbox.service";

export async function createSandboxFromPrompt(req: Request, res: Response) {
    const userId = (req as any).user.id;
    const { prompt } = req.body;

    const sandbox = await createSandboxFromPromptService(prompt, userId);

    return res.status(201).json({
        message: "Sandbox created successfully",
        sandbox
    });
}