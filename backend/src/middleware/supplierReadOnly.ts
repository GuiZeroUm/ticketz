import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";

// This runtime is for monitoring suppliers. Keep the restriction on the API:
// hiding controls in React would still leave message and campaign routes open.
const supplierReadOnly = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (process.env.ACNORTE_SUPPLIER_SSO_ROLE !== "target") return next();
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const path = req.path;
  const allowed =
    /^\/auth\/(login|login\/identify|refresh_token|logout|fornecedores\/trocar)$/.test(
      path
    ) ||
    /^\/whatsapp\/?(?:\d+)?$/.test(path) ||
    /^\/whatsappsession\/(?:\d+(?:\/capture-token|\/reset)?|capture\/[A-Za-z0-9_-]+)$/.test(
      path
    );
  if (!allowed) throw new AppError("ERR_SUPPLIER_READ_ONLY", 403);
  next();
};

export default supplierReadOnly;
