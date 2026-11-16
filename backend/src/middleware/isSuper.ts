import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import User from "../models/User";
import { isPlatformSuper } from "../helpers/platformSuper";

const isSuper = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = await User.findByPk(req.user.id);
  if (!isPlatformSuper(user)) {
    throw new AppError("Acesso não permitido", 401);
  }

  return next();
};

export default isSuper;
