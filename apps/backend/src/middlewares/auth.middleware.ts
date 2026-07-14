import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/client";
import { AppError } from "../errors/AppError";

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
    // Temporary Mock Auth: 
    // This temporarily acts as a logged-in user session.
    // In the future, this is where you'll verify a JWT token and find the user by ID.
    const user = await prisma.user.findUnique({
        where: { email: "demo@envops.local" }
    });

    if (!user) {
        return next(new AppError("Unauthorized", 401));
    }

    // Attach user to the request object so controllers can access it
    (req as any).user = user;
    next();
};
