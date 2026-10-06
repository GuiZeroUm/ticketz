import { Request, Response } from "express";
import ListGroupsService from "../services/WhatsappGroupServices/ListGroupsService";
import UpdateGroupService from "../services/WhatsappGroupServices/UpdateGroupService";
import { assertGroupAccess } from "../services/WhatsappGroupServices/GroupAccessService";
import { markGroupRead } from "../services/WhatsappGroupServices/GroupUnreadService";
import ListGroupParticipantsService from "../services/WhatsappGroupServices/ListGroupParticipantsService";
import GetGroupUnreadCountService from "../services/WhatsappGroupServices/GetGroupUnreadCountService";
import parseConnectionFilter from "../helpers/parseConnectionFilter";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const mode = req.query.mode === "ticket" ? "ticket" : "conversation";
  const result = await ListGroupsService({
    companyId: req.user.companyId,
    userId: Number(req.user.id),
    profile:
      process.env.ACNORTE_SUPPLIER_SSO_ROLE === "target"
        ? "admin"
        : req.user.profile,
    mode,
    status: String(req.query.status || "") || undefined,
    searchParam: String(req.query.searchParam || ""),
    pageNumber: Number(req.query.pageNumber || 1),
    nextUpdatedAt: String(req.query.nextUpdatedAt || "") || undefined,
    nextTicketId: Number(req.query.nextTicketId) || undefined,
    minUpdatedAt: String(req.query.minUpdatedAt || "") || undefined,
    whatsappId: parseConnectionFilter(req.query.whatsappId)
  });
  return res.json(result);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const ticket = await UpdateGroupService({
    ticketId: Number(req.params.ticketId),
    mode: req.body.mode,
    queueIds: Array.isArray(req.body.queueIds) ? req.body.queueIds : [],
    serviceQueueId: Number(req.body.serviceQueueId) || undefined,
    user: req.user
  });
  return res.json(ticket);
};

export const read = async (req: Request, res: Response): Promise<Response> => {
  const ticketId = Number(req.params.ticketId);
  await assertGroupAccess(ticketId, req.user);
  await markGroupRead(ticketId, Number(req.user.id), req.user.companyId);
  return res.status(204).send();
};

export const unreadCount = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const count = await GetGroupUnreadCountService(
    Number(req.user.id),
    req.user.companyId,
    process.env.ACNORTE_SUPPLIER_SSO_ROLE === "target"
      ? "admin"
      : req.user.profile,
    parseConnectionFilter(req.query.whatsappId)
  );
  return res.json({ count });
};

export const participants = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const result = await ListGroupParticipantsService(
    Number(req.params.ticketId),
    req.user
  );
  return res.json(result);
};
