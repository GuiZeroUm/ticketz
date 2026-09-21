import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import ShowUserService from "../UserServices/ShowUserService";
import { canUserSeeTicket } from "./TicketVisibility";

interface RequestUser {
  id: number | string;
  profile: string;
}

// O frontend ja escondia o que o atendente nao deveria abrir, mas esconder nao
// e autorizar: a rota aceitava qualquer ticket da empresa para quem soubesse a
// URL. Esta checagem roda no backend, que e a autoridade.
const AssertTicketAccessService = async (
  ticket: Ticket,
  requestUser: RequestUser
): Promise<void> => {
  if (requestUser.profile === "admin") return;

  const user = await ShowUserService(requestUser.id);
  const userQueueIds = user.queues?.map(queue => queue.id) || [];

  if (!canUserSeeTicket(user.profile, user.id, userQueueIds, ticket)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
};

export default AssertTicketAccessService;
