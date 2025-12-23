import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const optionalAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = (req.header("authorization") || req.header("Authorization")) as string | undefined;
    const headerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined;
    const cookieToken = (req as any).cookies?.token as string | undefined;
    const token = headerToken || cookieToken;
    if (!token) return next();

    const secret = process.env.JWT_SECRET;
    if (!secret) return next();

    const decoded = jwt.verify(token, secret) as any;
    (req as any).user = { id: decoded.id ?? decoded._id, role: decoded.role };
  } catch (err) {
    // ignore invalid token to not block guests
    console.warn("[optionalAuth] token invalid or missing");
  }
  return next();
};