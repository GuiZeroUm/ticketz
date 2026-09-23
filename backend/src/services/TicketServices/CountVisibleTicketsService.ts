import { Op, WhereOptions } from "sequelize";
import Ticket from "../../models/Ticket";
import ShowUserService from "../UserServices/ShowUserService";
import { getTicketAccessMode } from "./TicketAccessPolicy";
import { ticketQueueScope } from "./TicketQueueAccess";

interface Request {
  companyId: number;
  userId: number | string;
  profile: string;
  requestedQueueIds?: number[];
}

const CountVisibleTicketsService = async ({
  companyId,
  userId,
  profile,
  requestedQueueIds
}: Request): Promise<{ open: number; pending: number }> => {
  const user = await ShowUserService(userId);
  const assignedQueueIds = (user.queues || []).map(queue => Number(queue.id));
  const requested = Array.isArray(requestedQueueIds)
    ? requestedQueueIds.map(Number).filter(Number.isFinite)
    : assignedQueueIds;
  const queueIds =
    profile === "admin"
      ? requested
      : requested.filter(id => assignedQueueIds.includes(id));
  const accessMode = await getTicketAccessMode(companyId);
  const base: WhereOptions<Ticket> = {
    companyId,
    isGroup: false
  };

  if (profile === "admin") {
    const queueScope = queueIds.length
      ? ticketQueueScope(profile, queueIds)
      : {};
    const [open, pending] = await Promise.all([
      Ticket.count({ where: { ...base, ...queueScope, status: "open" } }),
      Ticket.count({ where: { ...base, ...queueScope, status: "pending" } })
    ]);
    return { open, pending };
  }

  if (accessMode === "owner") {
    const [open, pending] = await Promise.all([
      Ticket.count({ where: { ...base, status: "open", userId } }),
      Ticket.count({
        where: {
          ...base,
          status: "pending",
          [Op.or]: [
            { userId },
            {
              [Op.and]: [{ userId: null }, ticketQueueScope(profile, queueIds)]
            }
          ]
        }
      })
    ]);
    return { open, pending };
  }

  const queueScope = ticketQueueScope(profile, queueIds);
  const [open, pending] = await Promise.all([
    Ticket.count({ where: { ...base, ...queueScope, status: "open", userId } }),
    Ticket.count({
      where: {
        ...base,
        ...queueScope,
        status: "pending",
        [Op.or]: [{ userId }, { userId: null }]
      }
    })
  ]);
  return { open, pending };
};

export default CountVisibleTicketsService;
