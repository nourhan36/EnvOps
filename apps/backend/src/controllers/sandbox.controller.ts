import { Request, Response } from "express";
import {
    createSandbox as createSandboxService,
    getAllSandboxes,
    getSandboxById,
    deleteSandbox as deleteSandboxService
} from "../services/sandbox.service";

export async function getSandboxes(
    req: Request,
    res: Response
) {
    try {

        const sandboxes = await getAllSandboxes();

        return res.json(sandboxes);

    } catch (error: any) {

        return res.status(500).json({
            message: error.message
        });

    }
}

export async function getSandbox(
    req: Request<{ id: string }>,
    res: Response
) {
    try {

        const sandbox = await getSandboxById(req.params.id);

        return res.json(sandbox);

    } catch (error: any) {

        return res.status(404).json({
            message: error.message
        });

    }
}

export async function createSandbox(
    req: Request,
    res: Response
) {

    const { templateId } = req.body;

    if (!templateId) {
        return res.status(400).json({
            message: "templateId is required"
        });
    }

    try {

        const sandbox = await createSandboxService(templateId);

        return res.status(201).json({
            message: "Sandbox created successfully",
            sandbox
        });

    } catch (error: any) {

        return res.status(500).json({
            message: error.message
        });

    }
}

export async function deleteSandbox(
    req: Request<{ id: string }>,
    res: Response
) {

    try {

        const sandbox = await deleteSandboxService(
            req.params.id
        );

        return res.json({
            message: "Sandbox deleted successfully",
            sandbox
        });

    } catch (error: any) {

        return res.status(404).json({
            message: error.message
        });

    }

}