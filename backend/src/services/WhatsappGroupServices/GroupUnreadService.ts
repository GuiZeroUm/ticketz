import { Op } from "sequelize";
import GroupReadState from "../../models/GroupReadState";
import Ticket from "../../models/Ticket";
import { getIO } from "../../libs/socket";
import { listGroupRecipientIds } from "./GroupAccessService";

export const incrementGroupUnread = async (
  ticket: Ticket,
  senderUserId?: number
): Promise<void> => {
  if (!ticket.isGroup || ticket.contact?.groupMode === "ticket") return;

  const recipientIds = await listGroupRecipientIds(
    ticket.contactId,
    ticket.companyId,
    ticket.contact?.groupMode
  );
  await Promise.all(
    recipientIds
      .filter(id => id !== senderUserId)
      .map(async id => {
        const [state] = await GroupReadState.findOrCreate({
          where: { ticketId: ticket.id, userId: id },
          defaults: {
            ticketId: ticket.id,
            userId: id,
            companyId: ticket.companyId,
            unreadCount: 0
          }
        });
        await state.increment("unreadCount");
      })
  );
};

export const markGroupRead = async (
  ticketId: number,
  userId: number,
  companyId: number
): Promise<void> => {
  const [state] = await GroupReadState.findOrCreate({
    where: { ticketId, userId },
    defaults: { ticketId, userId, companyId, unreadCount: 0 }
  });
  await state.update({ unreadCount: 0, lastReadAt: new Date() });
  getIO().to(`user-${userId}`).emit(`company-${companyId}-ticket`, {
    action: "updateUnread",
    ticketId
  });
};

export const resetGroupUnreadForQueues = async (
  ticketIds: number[],
  companyId: number
): Promise<void> => {
  await GroupReadState.update(
    { unreadCount: 0, lastReadAt: new Date() },
    { where: { ticketId: { [Op.in]: ticketIds }, companyId } }
  );
};
