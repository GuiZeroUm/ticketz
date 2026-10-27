import AppError from "../../errors/AppError";
import GroupQueue from "../../models/GroupQueue";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import User from "../../models/User";
import Contact from "../../models/Contact";

export const getUserQueueIds = async (
  userId: number,
  companyId: number
): Promise<number[]> => {
  const user = await User.findOne({
    where: { id: userId, companyId },
    include: [{ model: Queue, as: "queues", attributes: ["id"] }]
  });
  if (!user) throw new AppError("ERR_NO_PERMISSION", 403);
  return user.queues?.map(queue => queue.id) || [];
};

// A conversation without configured queues is visible to its company. Once
// queues are configured, only their members may access it. Service-mode groups
// always require an explicit queue.
export const hasGroupAccess = async (
  groupContactId: number,
  companyId: number,
  groupMode: string | null | undefined,
  userQueueIds: number[]
): Promise<boolean> => {
  const groupQueues = await GroupQueue.findAll({
    where: { groupContactId, companyId },
    attributes: ["queueId"]
  });
  if (!groupQueues.length) return groupMode === "conversation";
  return groupQueues.some(item => userQueueIds.includes(item.queueId));
};

export const assertGroupAccess = async (
  ticketId: number | string,
  user: { id: string | number; companyId: number; profile: string }
): Promise<Ticket> => {
  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId: user.companyId, isGroup: true },
    include: [{ model: Contact, as: "contact" }]
  });

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }
  if (user.profile === "admin") {
    return ticket;
  }

  const queueIds = await getUserQueueIds(Number(user.id), user.companyId);
  const allowed = await hasGroupAccess(
    ticket.contactId,
    user.companyId,
    ticket.contact?.groupMode,
    queueIds
  );
  if (!allowed) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return ticket;
};

export default assertGroupAccess;
