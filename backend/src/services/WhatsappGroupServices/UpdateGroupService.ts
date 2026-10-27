import { Op } from "sequelize";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import GroupQueue from "../../models/GroupQueue";
import GroupReadState from "../../models/GroupReadState";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import TicketTraking from "../../models/TicketTraking";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import { incrementCounter } from "../CounterServices/IncrementCounter";
import { getIO } from "../../libs/socket";
import {
  assertGroupAccess,
  getUserGroupScope,
  listGroupRecipientIds
} from "./GroupAccessService";
import ShowTicketService from "../TicketServices/ShowTicketService";

interface Request {
  ticketId: number;
  mode: "conversation" | "ticket";
  queueIds: number[];
  serviceQueueId?: number;
  user: { id: string | number; companyId: number; profile: string };
}

const UpdateGroupService = async ({
  ticketId,
  mode,
  queueIds,
  serviceQueueId,
  user
}: Request): Promise<Ticket> => {
  if (!["conversation", "ticket"].includes(mode)) {
    throw new AppError("ERR_INVALID_GROUP_MODE", 400);
  }
  const currentScope = await getUserGroupScope(Number(user.id), user.companyId);
  if (currentScope.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const ticket = await assertGroupAccess(ticketId, user);
  const uniqueQueueIds = [...new Set(queueIds.map(Number).filter(Boolean))];
  if (!uniqueQueueIds.length) {
    throw new AppError("ERR_GROUP_QUEUE_REQUIRED", 400);
  }
  if (mode === "ticket" && !uniqueQueueIds.includes(Number(serviceQueueId))) {
    throw new AppError("ERR_GROUP_SERVICE_QUEUE_REQUIRED", 400);
  }
  const validQueues = await Queue.count({
    where: { id: { [Op.in]: uniqueQueueIds }, companyId: user.companyId }
  });
  if (validQueues !== uniqueQueueIds.length) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const oldMode = ticket.contact.groupMode || "conversation";
  const previousQueues = await GroupQueue.findAll({
    where: { groupContactId: ticket.contactId, companyId: user.companyId },
    attributes: ["queueId"]
  });
  const previousQueueIds = previousQueues.map(item => item.queueId);
  const previousRecipientIds =
    oldMode === "conversation"
      ? await listGroupRecipientIds(ticket.contactId, user.companyId, oldMode)
      : [];
  if (!previousQueueIds.length && user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  await sequelize.transaction(async transaction => {
    await GroupQueue.destroy({
      where: { groupContactId: ticket.contactId },
      transaction
    });
    await GroupQueue.bulkCreate(
      uniqueQueueIds.map(queueId => ({
        groupContactId: ticket.contactId,
        queueId,
        companyId: user.companyId
      })),
      { transaction }
    );
    await ticket.contact.update({ groupMode: mode }, { transaction });

    const relatedTickets = await Ticket.findAll({
      where: {
        contactId: ticket.contactId,
        companyId: user.companyId,
        isGroup: true
      },
      transaction
    });
    if (mode === "conversation" && oldMode !== "conversation") {
      const ids = relatedTickets.map(item => item.id);
      await TicketTraking.update(
        { expired: true, finishedAt: new Date() },
        { where: { ticketId: ids, finishedAt: { [Op.is]: null } }, transaction }
      );
      await Ticket.update(
        {
          status: "open",
          userId: null,
          queueId: null,
          chatbot: false,
          unreadMessages: 0
        },
        { where: { id: ids }, transaction }
      );
      await GroupReadState.update(
        { unreadCount: 0, lastReadAt: new Date() },
        { where: { ticketId: ids }, transaction }
      );
    } else if (oldMode !== "ticket") {
      await ticket.update(
        {
          status: "pending",
          userId: null,
          queueId: serviceQueueId,
          chatbot: false,
          unreadMessages: 0
        },
        { transaction }
      );
      await FindOrCreateATicketTrakingService({
        ticketId: ticket.id,
        companyId: user.companyId,
        whatsappId: ticket.whatsappId,
        transaction
      });
    } else if (ticket.queueId !== serviceQueueId) {
      await ticket.update(
        {
          status: "pending",
          userId: null,
          queueId: serviceQueueId,
          chatbot: false
        },
        { transaction }
      );
    }
  });

  if (mode === "ticket" && oldMode !== "ticket") {
    await incrementCounter(user.companyId, "ticket-create");
  }

  const updatedTicket = await ShowTicketService(ticket.id, user.companyId);
  const currentRecipientIds =
    mode === "conversation"
      ? await listGroupRecipientIds(ticket.contactId, user.companyId, mode)
      : [];
  const io = getIO();
  const ticketRoom = updatedTicket.id.toString();
  const connectedSockets = await io.in(ticketRoom).fetchSockets();
  await Promise.all(
    connectedSockets.map(socket => {
      const remainsAuthorized =
        socket.rooms.has(`company-${user.companyId}-admin`) ||
        uniqueQueueIds.some(queueId =>
          socket.rooms.has(`queue-${queueId}-notification`)
        );
      return remainsAuthorized ? Promise.resolve() : socket.leave(ticketRoom);
    })
  );

  if (oldMode === "ticket") {
    const removedRecipients = io.to(
      previousQueueIds
        .filter(queueId =>
          mode === "conversation" ? true : !uniqueQueueIds.includes(queueId)
        )
        .map(queueId => `queue-${queueId}-notification`)
    );
    removedRecipients.emit(`company-${user.companyId}-ticket`, {
      action: "delete",
      ticketId: updatedTicket.id
    });
  }
  if (oldMode === "conversation") {
    const previousRecipients = io.to(
      previousRecipientIds.map(id => `user-${id}`)
    );
    previousRecipients.emit(`company-${user.companyId}-ticket`, {
      action: "delete",
      ticketId: updatedTicket.id
    });
    previousRecipients.emit(`company-${user.companyId}-ticket`, {
      action: "updateUnread",
      ticketId: updatedTicket.id
    });
  }

  let recipients =
    mode === "conversation"
      ? io.to(currentRecipientIds.map(id => `user-${id}`))
      : io.to(ticketRoom).to(`company-${user.companyId}-admin`);
  if (mode === "ticket") {
    uniqueQueueIds.forEach(queueId => {
      recipients = recipients.to(`queue-${queueId}-notification`);
    });
  }
  recipients.emit(`company-${user.companyId}-ticket`, {
    action: "update",
    ticket: updatedTicket
  });
  return updatedTicket;
};

export default UpdateGroupService;
