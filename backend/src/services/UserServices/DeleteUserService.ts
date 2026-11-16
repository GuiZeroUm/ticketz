import User from "../../models/User";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import UpdateDeletedUserOpenTicketsStatus from "../../helpers/UpdateDeletedUserOpenTicketsStatus";
import { revokeUserMcpGrants } from "../McpServices/RevokeMcpGrantsService";
import { isPlatformSuper } from "../../helpers/platformSuper";

const DeleteUserService = async (
  id: string | number,
  requestUserId: string | number
): Promise<void> => {
  const user = await User.findOne({
    where: { id }
  });

  const requestUser = await User.findByPk(requestUserId);

  if (!user) {
    throw new AppError("ERR_NO_USER_FOUND", 404);
  }

  const requestIsPlatformSuper = isPlatformSuper(requestUser);

  if (
    !requestUser ||
    (!requestIsPlatformSuper && user.companyId !== requestUser.companyId)
  ) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  // Usuarios marcados como super so podem ser removidos pelo super admin da
  // plataforma.
  if (user.super && !requestIsPlatformSuper) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const userOpenTickets: Ticket[] = await user.$get("tickets", {
    where: { status: "open" }
  });

  if (userOpenTickets.length > 0) {
    UpdateDeletedUserOpenTicketsStatus(userOpenTickets, user.companyId);
  }

  await revokeUserMcpGrants(user.id);
  await user.destroy();
};

export default DeleteUserService;
