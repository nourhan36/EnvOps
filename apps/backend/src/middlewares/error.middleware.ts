import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("[Global Error Handler]", err);


  if (res.headersSent) {
    return next(err);
  }


  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || "Internal Server Error";

  const body: Record<string, unknown> = {
    message: message,
  };

  if (err.details) {
    body.details = err.details;
  }

  return res.status(statusCode).json(body);
};
