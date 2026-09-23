import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import ShowUserService from "../UserServices/ShowUserService";
import { canUserClaimTicket, canUserSeeTicket } from "./TicketVisibility";
import { getTicketAccessMode } from "./TicketAccessPolicy";

interface RequestUser {
  id: number | string;
  profile: string;
}

// O frontend ja escondia o que o atendente nao deveria abrir, mas esconder nao
// e autorizar: a rota aceitava qualquer ticket da empresa para quem soubesse a
// URL. Esta checagem roda no backend, que e a autoridade.
const AssertTicketAccessService = async (
  ticket: Ticket,
  requestUser: RequestUser,
  options: { allowClaimOnly?: boolean } = {}
): Promise<void> => {
  if (requestUser.profile === "admin") return;

  const user = await ShowUserService(requestUser.id);
  const userQueueIds = user.queues?.map(queue => queue.id) || [];

  const accessMode = await getTicketAccessMode(ticket.companyId);
  const allowed = options.allowClaimOnly
    ? canUserClaimTicket(
        user.profile,
        user.id,
        userQueueIds,
        ticket,
        accessMode
      )
    : canUserSeeTicket(user.profile, user.id, userQueueIds, ticket, accessMode);

  if (!allowed) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

export default AssertTicketAccessService;
