import { Sequelize, Op } from "sequelize";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import normalizeSlug from "../../helpers/normalizeSlug";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import { SerializeUser } from "../../helpers/SerializeUser";
import Queue from "../../models/Queue";
import Company from "../../models/Company";
import Setting from "../../models/Setting";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import UpdateSettingService from "../SettingServices/UpdateSettingService";

interface SerializedUser {
  id: number;
  name: string;
  email: string;
  profile: string;
  queues: Queue[];
  companyId: number;
}

interface Request {
  email: string;
  password: string;
  language?: string;
  // Slug do subdominio (tenant) sendo acessado. Quando presente e existente,
  // o login e' escopado a essa empresa: o mesmo email em empresas diferentes
  // resolve para o usuario DAQUELA empresa. Sem slug (apex / URL raw do
  // Railway) o login cai no comportamento global (busca por email).
  slug?: string;
}

// Resolve o companyId a partir do slug do subdominio. Retorna null quando nao
// ha slug, o slug e' invalido, ou nao existe empresa com esse slug — nesses
// casos o login volta ao modo global (por email), que serve de valvula de
// escape pelo apex/URL raw.
const resolveScopedCompanyId = async (
  slug?: string
): Promise<number | null> => {
  if (!slug) {
    return null;
  }

  let normalized = "";
  try {
    normalized = normalizeSlug(slug);
  } catch (_) {
    return null;
  }

  if (!normalized) {
    return null;
  }

  const company = await Company.findOne({
    where: { slug: normalized },
    attributes: ["id"]
  });

  return company ? company.id : null;
};

interface Response {
  serializedUser: SerializedUser;
  token: string;
  refreshToken: string;
}

const AuthUserService = async ({
  email,
  password,
  language,
  slug
}: Request): Promise<Response> => {
  const scopedCompanyId = await resolveScopedCompanyId(slug);

  const emailWhere = Sequelize.where(
    Sequelize.fn("LOWER", Sequelize.col("email")),
    email.toLowerCase()
  );

  // Com tenant resolvido pelo subdominio, restringe o usuario aquela empresa.
  // Assim o mesmo email pode existir em varias empresas e cada subdominio
  // autentica apenas o usuario da sua propria empresa.
  const where = scopedCompanyId
    ? { [Op.and]: [emailWhere, { companyId: scopedCompanyId }] }
    : emailWhere;

  const user = await User.findOne({
    where,
    include: ["queues", { model: Company, include: [{ model: Setting }] }]
  });

  if (!user) {
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  if (!(await user.checkPassword(password))) {
    throw new AppError("ERR_INVALID_CREDENTIALS", 401);
  }

  if (user.super && language) {
    if (!(await GetCompanySetting(1, "defaultLanguage", null))) {
      UpdateSettingService({
        key: "defaultLanguage",
        value: language,
        companyId: 1
      });
    }
  }

  const token = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  const serializedUser = await SerializeUser(user);

  return {
    serializedUser,
    token,
    refreshToken
  };
};

export default AuthUserService;
