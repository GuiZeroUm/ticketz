import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/HelpGroupServices/ListService";
import CreateService from "../services/HelpGroupServices/CreateService";
import ShowService from "../services/HelpGroupServices/ShowService";
import UpdateService from "../services/HelpGroupServices/UpdateService";
import DeleteService from "../services/HelpGroupServices/DeleteService";
import ReorderService from "../services/HelpGroupServices/ReorderService";

type StoreData = {
  title: string;
  subtitle?: string;
  icon?: string;
  audience?: string;
  isActive?: boolean;
};

// Recurso global, mesmo canal usado pelos conteudos.
const notify = (action: string, payload: Record<string, unknown>): void => {
  getIO().emit("helpGroup", { action, ...payload });
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const records = await ListService();

  return res.status(200).json(records);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const record = await CreateService(req.body as StoreData);

  notify("create", { record });

  return res.status(200).json(record);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const record = await ShowService(req.params.id);

  return res.status(200).json(record);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const record = await UpdateService({
    ...(req.body as StoreData),
    id: parseInt(req.params.id, 10)
  });

  notify("update", { record });

  return res.status(200).json(record);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;

  await DeleteService(id);

  notify("delete", { id });

  return res.status(200).json({ message: "Help group deleted" });
};

export const reorder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const records = await ReorderService({ items: req.body?.items });

  notify("reorder", { records });

  return res.status(200).json(records);
};
