import { Op, WhereOptions } from "sequelize";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import {
  canReadTicket,
  getHistoryAccessMode
} from "../TicketServices/TicketHistoryAccess";

interface Request {
  contactId: number;
  companyId: number;
  userId: number;
  profile: string;
  cursor?: string;
}

const ListContactHistoryService = async ({
  contactId,
  companyId,
  userId,
  profile,
  cursor
}: Request) => {
  const contact = await Contact.findOne({
    where: { id: contactId, companyId, isGroup: false },
    attributes: ["id"]
  });
  if (!contact) throw new AppError("ERR_NO_CONTACT_FOUND", 404);

  const user =
    profile === "admin"
      ? null
      : await User.findOne({
          where: { id: userId, companyId },
          include: [{ model: Queue, as: "queues", attributes: ["id"] }]
        });
  if (profile !== "admin" && !user) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const userQueueIds = user?.queues?.map(queue => queue.id) || [];
  const accessMode = await getHistoryAccessMode(companyId);
  const tickets = await Ticket.findAll({
    where: { contactId, companyId, channel: "whatsapp", isGroup: false },
    attributes: ["id", "uuid", "status", "queueId", "userId", "createdAt"],
    include: [
      { model: Queue, as: "queue", attributes: ["id", "name"] },
      { model: User, as: "user", attributes: ["id", "name"] }
    ]
  });
  const allowed = tickets.filter(ticket =>
    canReadTicket(profile, userId, userQueueIds, ticket, accessMode)
  );
  if (!allowed.length && tickets.length) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const allowedIds = allowed.map(ticket => ticket.id);
  if (!allowedIds.length) {
    return { messages: [], tickets: [], hasMore: false, nextCursor: null };
  }

  const messageVisibility = await GetCompanySetting(
    companyId,
    "messageVisibility",
    "message"
  );
  const where: WhereOptions<Message> = {
    companyId,
    ticketId: { [Op.in]: allowedIds },
    mediaType: { [Op.or]: [{ [Op.ne]: "reactionMessage" }, { [Op.is]: null }] }
  };
  if (profile !== "admin" && messageVisibility === "message") {
    where.queueId = { [Op.or]: [{ [Op.in]: userQueueIds }, { [Op.is]: null }] };
  }

  if (cursor) {
    const cursorMessage = await Message.findOne({
      where: { ...where, id: cursor },
      attributes: ["id", "createdAt"]
    });
    if (!cursorMessage) throw new AppError("ERR_MESSAGE_NOT_FOUND", 404);
    where[Op.or] = [
      { createdAt: { [Op.lt]: cursorMessage.createdAt } },
      {
        createdAt: cursorMessage.createdAt,
        id: { [Op.lt]: cursorMessage.id }
      }
    ];
  }

  const page = await Message.findAll({
    where,
    attributes: [
      "id",
      "ticketId",
      "body",
      "mediaType",
      "mediaUrl",
      "fromMe",
      "createdAt"
    ],
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"]
    ],
    limit: 101
  });
  const hasMore = page.length > 100;
  const visible = page.slice(0, 100);
  const sourceIds = new Set(visible.map(message => message.ticketId));

  return {
    messages: visible.reverse(),
    tickets: allowed
      .filter(ticket => sourceIds.has(ticket.id))
      .map(ticket => ({
        id: ticket.id,
        uuid: ticket.uuid,
        status: ticket.status,
        createdAt: ticket.createdAt,
        queue: ticket.queue?.name || null,
        user: ticket.user?.name || null
      })),
    hasMore,
    nextCursor: hasMore ? visible[0]?.id || null : null
  };
};

export default ListContactHistoryService;
