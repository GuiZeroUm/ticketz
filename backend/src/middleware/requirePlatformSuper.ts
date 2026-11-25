import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import User from "../models/User";
import { isPlatformSuper } from "../helpers/platformSuper";

// Ações restritas ao super admin da plataforma dentro de telas que outros
// perfis também usam (ex.: cancelar nota fiscal na Central de Cobrança).
// Responde 403 — o usuário está autenticado, só não tem permissão.
const requirePlatformSuper = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const user = await User.findByPk(req.user.id);
  if (!isPlatformSuper(user)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return next();
};

export default requirePlatformSuper;
