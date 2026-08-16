import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/HelpServices/ListService";
import CreateService from "../services/HelpServices/CreateService";
import ShowService from "../services/HelpServices/ShowService";
import UpdateService from "../services/HelpServices/UpdateService";
import DeleteService from "../services/HelpServices/DeleteService";
import FindService from "../services/HelpServices/FindService";
import ReorderService from "../services/HelpServices/ReorderService";
import ShowPublicService from "../services/HelpGroupServices/ShowPublicService";
import sanitizeHelpContent from "../helpers/sanitizeHelpContent";

import AppError from "../errors/AppError";

type IndexQuery = {
  searchParam: string;
  groupId: string;
};

type StoreData = {
  groupId: number;
  title: string;
  description?: string;
  type?: string;
  video?: string;
  content?: string;
  duration?: string;
  link?: string;
  isActive?: boolean;
};

const CONTENT_TYPES = ["video", "article"];

// A Central de Ajuda e global (super admin edita para todos), entao o socket
// nao pode ir por canal de empresa: quem escuta e qualquer tela aberta.
const notify = (action: string, payload: Record<string, unknown>): void => {
  getIO().emit("help", { action, ...payload });
};

const validate = async (data: StoreData): Promise<StoreData> => {
  const type = data.type || "video";

  if (!CONTENT_TYPES.includes(type)) {
    throw new AppError("ERR_HELP_INVALID_TYPE", 400);
  }

  const schema = Yup.object().shape({
    title: Yup.string().required("ERR_HELP_REQUIRED"),
    groupId: Yup.number()
      .integer("ERR_HELP_INVALID_GROUP")
      .required("ERR_HELP_GROUP_REQUIRED")
  });

  try {
    await schema.validate({ title: data.title, groupId: data.groupId });
  } catch (err) {
    throw new AppError(err.message);
  }

  if (type === "video" && !data.video && !data.link) {
    throw new AppError("ERR_HELP_VIDEO_REQUIRED", 400);
  }

  const content = type === "article" ? sanitizeHelpContent(data.content) : null;

  if (type === "article" && !content.replace(/<[^>]*>/g, "").trim()) {
    throw new AppError("ERR_HELP_CONTENT_REQUIRED", 400);
  }

  return { ...data, type, content };
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, groupId } = req.query as IndexQuery;

  const records = await ListService({ searchParam, groupId });

  return res.json(records);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const data = await validate(req.body as StoreData);

  const record = await CreateService(data);

  notify("create", { record });

  return res.status(200).json(record);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const record = await ShowService(id);

  return res.status(200).json(record);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const data = await validate(req.body as StoreData);
  const { id } = req.params;

  const record = await UpdateService({
    ...data,
    id: parseInt(id, 10)
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

  return res.status(200).json({ message: "Help deleted" });
};

export const reorder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const records = await ReorderService({ items: req.body?.items });

  notify("reorder", { records });

  return res.status(200).json(records);
};

export const findList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const records = await FindService();

  return res.status(200).json(records);
};

export const showGroupContents = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const group = await ShowPublicService({
    groupId: req.params.id,
    audience: "company"
  });

  return res.status(200).json(group);
};
