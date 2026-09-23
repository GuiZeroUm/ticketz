import { Request, Response } from "express";
import { Mutex } from "async-mutex";
import { getIO } from "../libs/socket";
import Ticket from "../models/Ticket";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketUUIDService from "../services/TicketServices/ShowTicketFromUUIDService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import GetTicketTransferOptionsService from "../services/TicketServices/GetTicketTransferOptionsService";
import ListTicketsServiceKanban from "../services/TicketServices/ListTicketsServiceKanban";
import { assertGroupAccess } from "../services/WhatsappGroupServices/GroupAccessService";
import AppError from "../errors/AppError";
import { unassignedTicketRoom } from "../helpers/TicketSocketRooms";
import AssertTicketAccessService from "../services/TicketServices/AssertTicketAccessService";
import GetTicketServiceWindowService from "../services/TicketServices/TicketServiceWindowService";
import ListTicketTemplatesService from "../services/MetaWhatsAppServices/ListTicketTemplatesService";
import Whatsapp from "../models/Whatsapp";
import ShowUserService from "../services/UserServices/ShowUserService";
import { usesOwnerTicketAccess } from "../services/TicketServices/TicketAccessPolicy";
import { serializeClaimOnlyTicket } from "../services/TicketServices/ClaimOnlyTicket";
import CountVisibleTicketsService from "../services/TicketServices/CountVisibleTicketsService";

type IndexQuery = {
  isSearch?: string;
  searchParam: string;
  pageNumber?: string;
  nextUpdatedAt?: string;
  nextTicketId?: string;
  status: string;
  groups: string;
  date: string;
  updatedAt?: string;
  minUpdatedAt?: string;
  showAll: string;
  withUnreadMessages: string;
  notClosed: string;
  all: string;
  queueIds: string;
  contactId: string;
  tags: string;
  users: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
}

const updateMutex = new Mutex();

export const counts = async (
  req: Request,
  res: Response
): Promise<Response> => {
  let requestedQueueIds: number[] | undefined;
  if (req.query.queueIds) {
    try {
      const parsed = JSON.parse(String(req.query.queueIds));
      if (!Array.isArray(parsed)) throw new Error();
      requestedQueueIds = parsed;
    } catch {
      throw new AppError("ERR_INVALID_QUEUE_FILTER", 400);
    }
  }
  const result = await CountVisibleTicketsService({
    companyId: req.user.companyId,
    userId: req.user.id,
    profile: req.user.profile,
    requestedQueueIds
  });
  return res.json(result);
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    nextUpdatedAt,
    status,
    groups,
    date,
    updatedAt,
    minUpdatedAt,
    isSearch,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    contactId,
    tags: tagIdsStringified,
    users: userIdsStringified,
    withUnreadMessages,
    notClosed,
    all
  } = req.query as IndexQuery;

  const userId = req.user.id;
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  // `queueIds` chega cru do querystring. Sem intersectar com as filas do
  // usuario, bastava editar a URL para listar os atendimentos de qualquer
  // setor. Uma selecao vazia continua sendo vazia (o atendente desmarcou tudo
  // no filtro); so a ausencia do parametro assume todas as filas dele.
  if (req.user.profile !== "admin") {
    const requestUser = await ShowUserService(userId);
    const allowedQueueIds = (requestUser.queues || []).map(queue => queue.id);
    queueIds = queueIdsStringified
      ? queueIds.filter(queueId => allowedQueueIds.includes(Number(queueId)))
      : allowedQueueIds;
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  const { tickets, count } = await ListTicketsService({
    isSearch: isSearch === "true",
    searchParam,
    contactId: Number(contactId) || undefined,
    tags: tagsIds,
    users: usersIds,
    nextUpdatedAt,
    status,
    groups,
    date,
    updatedAt,
    minUpdatedAt,
    showAll,
    userId,
    queueIds,
    withUnreadMessages,
    notClosed: !!notClosed,
    all: !!all,
    companyId
  });

  return res.status(200).json({
    tickets,
    count
  });
};

export const kanban = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    updatedAt,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    tags: tagIdsStringified,
    users: userIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  const userId = req.user.id;
  const { companyId } = req.user;

  let queueIds: number[] = [];
  let tagsIds: number[] = [];
  let usersIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  if (tagIdsStringified) {
    tagsIds = JSON.parse(tagIdsStringified);
  }

  if (userIdsStringified) {
    usersIds = JSON.parse(userIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsServiceKanban({
    searchParam,
    tags: tagsIds,
    users: usersIds,
    pageNumber,
    status,
    date,
    updatedAt,
    showAll,
    userId,
    queueIds,
    withUnreadMessages,
    companyId
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, userId, queueId }: TicketData = req.body;
  const { companyId } = req.user;

  const ticket = await CreateTicketService({
    contactId,
    userId,
    companyId,
    queueId
  });

  const io = getIO();
  const ownerOnly = await usesOwnerTicketAccess(companyId);
  if (ownerOnly && ticket.status === "pending" && !ticket.userId) {
    let claimRecipients = io.to(`queue-${ticket.queueId}-pending`);
    if (ticket.queueId === null) {
      claimRecipients = claimRecipients.to(
        unassignedTicketRoom(companyId, ticket.status)
      );
    }
    claimRecipients.emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket: serializeClaimOnlyTicket(ticket)
    });
    io.to(`company-${companyId}-admin`).emit(`company-${companyId}-ticket`, {
      action: "update",
      ticket
    });
    return res.status(200).json(serializeClaimOnlyTicket(ticket));
  }
  if (ownerOnly) {
    io.to(`company-${companyId}-admin`)
      .to(`user-${ticket.userId}`)
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });
    return res.status(200).json(ticket);
  }
  let recipients = io
    .to(`company-${companyId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-${ticket.status}`);
  if (ticket.queueId === null) {
    recipients = recipients.to(unassignedTicketRoom(companyId, ticket.status));
  }
  recipients.emit(`company-${companyId}-ticket`, {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  const contact = await ShowTicketService(ticketId, companyId);

  if (contact.isGroup) {
    await assertGroupAccess(ticketId, req.user);
  } else {
    await AssertTicketAccessService(contact, req.user);
  }

  return res.status(200).json(contact);
};

export const showFromUUID = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { uuid } = req.params;

  const ticket: Ticket = await ShowTicketUUIDService(uuid);

  if (ticket.companyId !== req.user.companyId) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  if (ticket.isGroup) {
    await assertGroupAccess(ticket.id, req.user);
  } else {
    await AssertTicketAccessService(ticket, req.user);
  }

  return res.status(200).json(ticket);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const current = await ShowTicketService(ticketId, req.user.companyId);
  const ownerOnly = await usesOwnerTicketAccess(req.user.companyId);
  const isAtomicClaim =
    ownerOnly &&
    req.user.profile !== "admin" &&
    !current.isGroup &&
    current.status === "pending" &&
    !current.userId &&
    req.body.status === "open";
  if (current.isGroup) {
    await assertGroupAccess(ticketId, req.user);
    if (current.contact?.groupMode !== "ticket") {
      throw new AppError("ERR_GROUP_CONVERSATION_NOT_TICKET", 400);
    }
  } else {
    await AssertTicketAccessService(current, req.user, {
      allowClaimOnly: isAtomicClaim
    });
  }

  const { ticket } = await updateMutex.runExclusive(async () => {
    let claimedFromPending = false;
    let ticketData = req.body;

    if (isAtomicClaim) {
      const [claimed] = await Ticket.update(
        { userId: Number(req.user.id) },
        {
          where: {
            id: current.id,
            companyId: req.user.companyId,
            status: "pending",
            userId: null
          }
        }
      );
      if (claimed !== 1) {
        throw new AppError("ERR_TICKET_ALREADY_CLAIMED", 409);
      }
      claimedFromPending = true;
      ticketData = {
        userId: Number(req.user.id),
        status: "open"
      };
    }

    const result = await UpdateTicketService({
      ticketData,
      ticketId: Number.parseInt(ticketId, 10),
      reqUserId: Number(req.user.id),
      claimedFromPending
    });
    return result;
  });

  return res.status(200).json(ticket);
};

export const transferOptions = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  const current = await ShowTicketService(ticketId, companyId);
  if (current.isGroup) {
    await assertGroupAccess(ticketId, req.user);
    if (current.contact?.groupMode !== "ticket") {
      throw new AppError("ERR_GROUP_CONVERSATION_NOT_TICKET", 400);
    }
  } else {
    await AssertTicketAccessService(current, req.user);
  }

  const options = await GetTicketTransferOptionsService({
    ticketId,
    companyId
  });

  return res.status(200).json(options);
};

// A tela do atendimento precisa saber, numa chamada so, se ainda da pra mandar
// texto livre e, se nao der, quais templates estao aprovados para reabrir a
// conversa.
export const templates = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  const ticket = await ShowTicketService(ticketId, companyId);

  if (ticket.isGroup) {
    await assertGroupAccess(ticketId, req.user);
  } else {
    await AssertTicketAccessService(ticket, req.user);
  }

  const window = await GetTicketServiceWindowService(ticket);
  const connection = await Whatsapp.findByPk(ticket.whatsappId);
  const official = connection?.apiMode === "official";

  // A lista so importa quando a janela fechou; buscar sempre gastaria uma
  // chamada a Graph API a cada atendimento aberto, sem serventia nenhuma.
  const needsTemplates = official && !window.open;

  return res.status(200).json({
    official,
    window,
    templates: needsTemplates
      ? await ListTicketTemplatesService(connection)
      : []
  });
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;

  const current = await ShowTicketService(ticketId, companyId);
  if (current.isGroup) {
    await assertGroupAccess(ticketId, req.user);
    if (current.contact?.groupMode !== "ticket") {
      throw new AppError("ERR_GROUP_CONVERSATION_NOT_TICKET", 400);
    }
  } else {
    await AssertTicketAccessService(current, req.user);
  }

  const ticket = await DeleteTicketService(ticketId);

  const io = getIO();
  if (await usesOwnerTicketAccess(companyId)) {
    let recipients = io
      .to(ticketId)
      .to(`company-${companyId}-admin`);
    if (ticket.userId) {
      recipients = recipients.to(`user-${ticket.userId}`);
    }
    recipients.emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticketId: +ticketId
    });

    return res.status(200).json({ message: "ticket deleted" });
  }

  let recipients = io
    .to(ticketId)
    .to(`company-${companyId}-${ticket.status}`)
    .to(`company-${companyId}-notification`)
    .to(`queue-${ticket.queueId}-${ticket.status}`)
    .to(`queue-${ticket.queueId}-notification`);
  if (ticket.queueId === null) {
    recipients = recipients
      .to(unassignedTicketRoom(companyId, ticket.status))
      .to(unassignedTicketRoom(companyId, "notification"));
  }
  recipients.emit(`company-${companyId}-ticket`, {
    action: "delete",
    ticketId: +ticketId
  });

  return res.status(200).json({ message: "ticket deleted" });
};
