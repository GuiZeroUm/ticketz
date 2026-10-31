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

export const getUserGroupScope = async (userId: number, companyId: number) => {
  const user = await User.findOne({
    where: { id: userId, companyId },
    include: [{ model: Queue, as: "queues", attributes: ["id"] }]
  });
  if (!user) throw new AppError("ERR_NO_PERMISSION", 403);
  return {
    queueIds: user.queues?.map(queue => queue.id) || [],
    groupAccessIds: user.groupAccessIds,
    profile: user.profile
  };
};

// A conversation without configured queues is visible to its company. Once
// queues are configured, only their members may access it. Service-mode groups
// always require an explicit queue.
export const hasGroupAccess = async (
  groupContactId: number,
  companyId: number,
  groupMode: string | null | undefined,
  userQueueIds: number[],
  groupAccessIds: number[] | null = null
): Promise<boolean> => {
  if (groupMode === "conversation" && Array.isArray(groupAccessIds)) {
    return groupAccessIds.includes(groupContactId);
  }
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
  const { queueIds, groupAccessIds, profile } = await getUserGroupScope(
    Number(user.id),
    user.companyId
  );
  if (profile === "admin") return ticket;
  const allowed = await hasGroupAccess(
    ticket.contactId,
    user.companyId,
    ticket.contact?.groupMode,
    queueIds,
    groupAccessIds
  );
  if (!allowed) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return ticket;
};

export const listGroupRecipientIds = async (
  groupContactId: number,
  companyId: number,
  groupMode: string | null | undefined
): Promise<number[]> => {
  const users = await User.findAll({
    where: { companyId },
    attributes: ["id", "profile", "groupAccessIds"],
    include: [{ model: Queue, as: "queues", attributes: ["id"] }]
  });
  const groupQueues = await GroupQueue.findAll({
    where: { groupContactId, companyId },
    attributes: ["queueId"]
  });
  const queueIds = groupQueues.map(item => item.queueId);
  return users
    .filter(user => {
      if (user.profile === "admin") return true;
      if (groupMode === "conversation" && Array.isArray(user.groupAccessIds)) {
        return user.groupAccessIds.includes(groupContactId);
      }
      if (!queueIds.length) return groupMode === "conversation";
      return user.queues?.some(queue => queueIds.includes(queue.id));
    })
    .map(user => user.id);
};

export default assertGroupAccess;
