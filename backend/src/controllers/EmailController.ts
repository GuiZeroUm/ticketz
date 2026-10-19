import { Request, Response } from "express";
import { emailEnabledForCompany } from "../services/EmailServices/EmailAccessService";

export const availability = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const enabled = await emailEnabledForCompany(req.user.companyId);

  return res.status(200).json({ enabled });
};
