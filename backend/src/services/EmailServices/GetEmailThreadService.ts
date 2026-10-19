import { Op, WhereOptions } from "sequelize";
import AppError from "../../errors/AppError";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import serializeEmailAccount from "../../helpers/SerializeEmailAccount";
import { getIO } from "../../libs/socket";
import EmailAccount from "../../models/EmailAccount";
import EmailAttachment from "../../models/EmailAttachment";
import EmailMessage from "../../models/EmailMessage";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import { logger } from "../../utils/logger";

// Most recent messages of one thread; older ones are not loaded.
const THREAD_MESSAGE_LIMIT = 300;
const FIXED_CODE = /^ERR_EMAIL_\w+$/;
const GENERIC_SEND_ERROR = "ERR_EMAIL_SEND_FAILED";

const noTicket = () => new AppError("ERR_NO_TICKET_FOUND", 404);

// Same rule as MessageController.index + ListMessagesService: a non-admin only
// sees messages routed to one of their queues (or to no queue) when the
// company keeps "messageVisibility" on "message".
const visibleQueueIds = async (
  companyId: number,
  user: { id: number | string; profile: string }
): Promise<number[] | null> => {
  if (user.profile === "admin") return null;

  const record = await User.findByPk(user.id, {
    include: [{ model: Queue, as: "queues" }]
  });
  const queueIds = (record?.queues || []).map(queue => queue.id);
  if (queueIds.length === 0) return null;

  const visibility = await GetCompanySetting(
    companyId,
    "messageVisibility",
    "message"
  );
  return visibility === "message" ? queueIds : null;
};

// Only the fixed ERR_EMAIL_* code is exposed, never the timestamp or any
// provider text that might have been stored next to it.
const publicSendError = (
  sendError: EmailMessage["sendError"],
  direction: string
): { code: string } | null => {
  if (direction !== "out" || !sendError) return null;
  const code = typeof sendError.code === "string" ? sendError.code : "";
  return { code: FIXED_CODE.test(code) ? code : GENERIC_SEND_ERROR };
};

const publicAttachment = (attachment: EmailAttachment) => ({
  id: attachment.id,
  filename: attachment.filename,
  size: attachment.size,
  contentType: attachment.contentType,
  skippedReason: attachment.skippedReason
});

// The ticket is read in the thread: the unread counter goes back to zero and
// the inbox is told, like GET /messages/:ticketId does for WhatsApp tickets
// (SetTicketMessagesAsRead). There is nothing to mark on the mail provider.
const markThreadRead = async (ticket: Ticket): Promise<void> => {
  if (!(ticket.unreadMessages > 0)) return;

  await Ticket.update(
    { unreadMessages: 0 },
    { where: { id: ticket.id, companyId: ticket.companyId }, silent: true }
  );
  await Message.update(
    { read: true },
    {
      where: { ticketId: ticket.id, companyId: ticket.companyId, read: false }
    }
  );

  try {
    getIO()
      .to(ticket.id.toString())
      .to(`company-${ticket.companyId}-${ticket.status}`)
      .to(`queue-${ticket.queueId}-${ticket.status}`)
      .emit(`company-${ticket.companyId}-ticket`, {
        action: "updateUnread",
        ticketId: ticket.id
      });
  } catch {
    logger.warn(
      { companyId: ticket.companyId, ticketId: ticket.id },
      "Could not emit email ticket unread update"
    );
  }
};

const GetEmailThreadService = async ({
  ticketId,
  user
}: {
  ticketId: number;
  user: { id: number | string; companyId: number; profile: string };
}) => {
  const { companyId } = user;
  if (!Number.isInteger(ticketId) || ticketId < 1) throw noTicket();

  // Another company's ticket is indistinguishable from a missing one.
  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId },
    attributes: [
      "id",
      "companyId",
      "channel",
      "status",
      "queueId",
      "subject",
      "emailAccountId",
      "unreadMessages"
    ]
  });
  if (!ticket || ticket.channel !== "email") throw noTicket();

  const queueIds = await visibleQueueIds(companyId, user);

  const rows = await EmailMessage.findAll({
    where: { ticketId: ticket.id, companyId },
    include: [{ model: EmailAttachment, as: "attachments", required: false }],
    order: [
      ["createdAt", "DESC"],
      ["id", "DESC"]
    ],
    limit: THREAD_MESSAGE_LIMIT
  });

  const messageWhere: WhereOptions = {
    id: { [Op.in]: rows.map(row => row.messageId) },
    ticketId: ticket.id,
    companyId
  };
  if (queueIds) {
    messageWhere.queueId = { [Op.or]: { [Op.in]: queueIds, [Op.eq]: null } };
  }
  const chatMessages = rows.length
    ? await Message.findAll({
        where: messageWhere,
        attributes: ["id", "body"]
      })
    : [];
  const bodies = new Map(chatMessages.map(item => [item.id, item.body]));

  const messages = rows
    .filter(row => !queueIds || bodies.has(row.messageId))
    .map(row => ({
      id: row.id,
      messageId: row.messageId,
      direction: row.direction,
      from: row.fromAddress,
      to: row.toAddresses || [],
      cc: row.ccAddresses || [],
      date: row.receivedAt || row.createdAt,
      text: bodies.get(row.messageId) ?? "",
      htmlSanitized: row.htmlSanitized,
      sendStatus: row.sendStatus,
      sendError: publicSendError(row.sendError, row.direction),
      attachments: (row.attachments || []).map(publicAttachment)
    }))
    .sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id
    );

  const account = ticket.emailAccountId
    ? await EmailAccount.findOne({
        where: { id: ticket.emailAccountId, companyId }
      })
    : null;

  await markThreadRead(ticket);

  return {
    account: account ? serializeEmailAccount(account) : null,
    subject: ticket.subject,
    messages
  };
};

export default GetEmailThreadService;
