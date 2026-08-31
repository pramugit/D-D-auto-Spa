import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "../utils/AppError";

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new AppError(400, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw new AppError(400, result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    (req as unknown as { validatedQuery: unknown }).validatedQuery = result.data;
    next();
  };
}
