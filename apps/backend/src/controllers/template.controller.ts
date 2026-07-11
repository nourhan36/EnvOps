import { Request, Response } from "express";
import { getAllTemplates } from "../services/template.service";

export async function getTemplates(req: Request, res: Response) {
    const templates = await getAllTemplates();

    return res.json(templates);
}
