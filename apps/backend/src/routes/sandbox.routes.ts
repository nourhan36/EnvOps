import { Router } from "express";
import {
    createSandbox,
    getSandboxes,
    getSandbox,
    deleteSandbox
} from "../controllers/sandbox.controller";

const router = Router();

router.get("/", getSandboxes);

router.get("/:id", getSandbox);

router.post("/", createSandbox);

router.delete("/:id", deleteSandbox);

export default router;