import * as Yup from "yup";

import AppError from "../../errors/AppError";
import ShowUserService from "./ShowUserService";
import Company from "../../models/Company";
import User from "../../models/User";
import { revokeUserMcpGrants } from "../McpServices/RevokeMcpGrantsService";
import { validateVisibleScreens } from "../../helpers/screenAccess";
import validateGroupAccessIds from "../WhatsappGroupServices/ValidateGroupAccessIds";
import { isPlatformSuper } from "../../helpers/platformSuper";

interface UserData {
  email?: string;
  password?: string;
  name?: string;
  profile?: string;
  companyId?: number;
  queueIds?: number[];
  visibleScreens?: string[] | null;
  groupAccessIds?: number[] | null;
}

interface Request {
  userData: UserData;
  userId: string | number;
  requestUserId: number;
}

interface Response {
  id: number;
  name: string;
  email: string;
  profile: string;
  visibleScreens: string[] | null;
}

const UpdateUserService = async ({
  userData,
  userId,
  requestUserId
}: Request): Promise<Response | undefined> => {
  const user = await ShowUserService(userId, requestUserId);

  const requestUser = await User.findByPk(requestUserId);

  const requestIsPlatformSuper = isPlatformSuper(requestUser);
  const isSelfUpdate = +userId === requestUser.id;

  if (
    !requestIsPlatformSuper &&
    !isSelfUpdate &&
    (user.companyId !== requestUser.companyId ||
      requestUser.profile !== "admin")
  ) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  // Usuarios marcados como super so podem ser alterados por eles mesmos ou
  // pelo super admin da plataforma.
  if (user.super && !isSelfUpdate && !requestIsPlatformSuper) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }

  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    email: Yup.string().email(),
    profile: Yup.string(),
    password: Yup.string()
  });

  const {
    email,
    password,
    profile,
    name,
    queueIds = [],
    visibleScreens,
    groupAccessIds
  } = userData;
  const securityIdentityChanged =
    Boolean(password) || (profile !== undefined && profile !== user.profile);

  try {
    await schema.validate({ email, password, profile, name });
  } catch (err: unknown) {
    throw new AppError((err as Error).message);
  }

  if (requestUser.profile === "admin") {
    await user.update({
      email,
      password,
      profile,
      visibleScreens:
        visibleScreens === undefined
          ? undefined
          : validateVisibleScreens(visibleScreens),
      groupAccessIds:
        groupAccessIds === undefined
          ? undefined
          : await validateGroupAccessIds(groupAccessIds, user.companyId),
      name
    });
    await user.$set("queues", queueIds);
  } else {
    await user.update({
      email,
      password,
      name
    });
  }

  await user.reload();

  if (securityIdentityChanged) {
    await revokeUserMcpGrants(user.id);
  }

  const company = await Company.findByPk(user.companyId);

  const serializedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    profilePicUrl: user.profilePicUrl,
    super: isPlatformSuper(user),
    profile: user.profile,
    visibleScreens: user.visibleScreens,
    groupAccessIds: user.groupAccessIds,
    companyId: user.companyId,
    company,
    queues: user.queues
  };

  return serializedUser;
};

export default UpdateUserService;
