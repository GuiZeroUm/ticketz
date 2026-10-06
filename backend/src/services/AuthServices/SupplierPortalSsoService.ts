import { randomBytes, randomUUID } from "crypto";
import { sign, verify, JwtPayload } from "jsonwebtoken";
import { Op, Sequelize } from "sequelize";
import AppError from "../../errors/AppError";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import Setting from "../../models/Setting";
import User from "../../models/User";
import { cacheLayer } from "../../libs/cache";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import { SerializeUser } from "../../helpers/SerializeUser";
import { assertRuntimeCompany } from "../../helpers/tenantRuntime";
import sequelize from "../../database";

const ISSUER = "espaco-whats-acnorte";
const AUDIENCE = "acnortefornecedores.espacowhats.com.br";

const secret = (): string => {
  const value = process.env.ACNORTE_SUPPLIER_SSO_SECRET || "";
  if (value.length < 32)
    throw new AppError("ERR_SUPPLIER_SSO_UNAVAILABLE", 503);
  return value;
};

export const issueSupplierAccess = async (sourceUserId: number) => {
  if (process.env.ACNORTE_SUPPLIER_SSO_ROLE !== "source") {
    throw new AppError("ERR_FORBIDDEN", 403);
  }
  const sourceCompanyId = Number(
    process.env.ACNORTE_SUPPLIER_SOURCE_COMPANY_ID
  );
  if (!Number.isSafeInteger(sourceCompanyId) || sourceCompanyId < 1) {
    throw new AppError("ERR_SUPPLIER_SSO_UNAVAILABLE", 503);
  }
  assertRuntimeCompany(sourceCompanyId);
  const user = await User.findOne({
    where: { id: sourceUserId, companyId: sourceCompanyId },
    include: [Company]
  });
  if (
    !user ||
    !user.company?.status ||
    user.company.platformStatus !== "ativo"
  ) {
    throw new AppError("ERR_FORBIDDEN", 403);
  }
  const token = sign(
    {
      email: user.email,
      name: user.name,
      profile: user.profile,
      super: !!user.super,
      sourceCompanyId
    },
    secret(),
    {
      algorithm: "HS256",
      issuer: ISSUER,
      audience: AUDIENCE,
      subject: String(user.id),
      jwtid: randomUUID(),
      expiresIn: "60s"
    }
  );
  return { token, url: `https://${AUDIENCE}/fornecedores/entrar#${token}` };
};

type SupplierClaims = JwtPayload & {
  email: string;
  name: string;
  profile: string;
  super: boolean;
  sourceCompanyId: number;
};

export const exchangeSupplierAccess = async (rawToken: unknown) => {
  if (process.env.ACNORTE_SUPPLIER_SSO_ROLE !== "target") {
    throw new AppError("ERR_FORBIDDEN", 403);
  }
  if (typeof rawToken !== "string" || rawToken.length > 4096) {
    throw new AppError("ERR_SUPPLIER_SSO_INVALID", 401);
  }

  let claims: SupplierClaims;
  try {
    claims = verify(rawToken, secret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE
    }) as SupplierClaims;
  } catch {
    throw new AppError("ERR_SUPPLIER_SSO_INVALID", 401);
  }
  if (
    !claims.jti ||
    !claims.sub ||
    claims.sourceCompanyId !==
      Number(process.env.ACNORTE_SUPPLIER_SOURCE_COMPANY_ID) ||
    typeof claims.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ||
    claims.email.length > 255 ||
    typeof claims.name !== "string" ||
    claims.name.trim().length < 2 ||
    claims.name.length > 255 ||
    !["admin", "user"].includes(claims.profile) ||
    typeof claims.super !== "boolean" ||
    (claims.super && claims.profile !== "admin")
  ) {
    throw new AppError("ERR_SUPPLIER_SSO_INVALID", 401);
  }

  const companyId = Number(process.env.ACNORTE_SUPPLIER_COMPANY_ID);
  if (!Number.isSafeInteger(companyId) || companyId < 1) {
    throw new AppError("ERR_SUPPLIER_SSO_UNAVAILABLE", 503);
  }
  assertRuntimeCompany(companyId);
  const nonceKey = `supplier-sso:${claims.jti}`;
  const claimed = await cacheLayer.setOnce(nonceKey, "1", 120);
  if (!claimed) throw new AppError("ERR_SUPPLIER_SSO_REPLAY", 401);

  const userId = await sequelize.transaction(async transaction => {
    const company = await Company.findByPk(companyId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const plan = company
      ? await Plan.findByPk(company.planId, { transaction })
      : null;
    if (
      !company?.status ||
      company.platformStatus !== "ativo" ||
      company.whatsappMode !== "normal" ||
      plan?.users !== 6 ||
      plan?.connections !== 20
    ) {
      throw new AppError("ERR_SUPPLIER_SSO_UNAVAILABLE", 503);
    }
    const email = claims.email.trim().toLowerCase();
    let user = await User.findOne({
      where: {
        companyId,
        [Op.and]: Sequelize.where(
          Sequelize.fn("LOWER", Sequelize.col("email")),
          email
        )
      },
      transaction
    });
    if (!user) {
      const regularCount = await User.count({
        where: { companyId, super: false },
        transaction
      });
      const superCount = await User.count({
        where: { companyId, super: true },
        transaction
      });
      if (
        (!claims.super && regularCount >= 5) ||
        (claims.super && superCount >= 1)
      ) {
        throw new AppError("ERR_SUPPLIER_USER_LIMIT", 403);
      }
      user = await User.create(
        {
          companyId,
          email,
          name: claims.name.trim(),
          profile: claims.profile,
          super: claims.super,
          password: randomBytes(36).toString("base64url"),
          passwordConfigured: true
        } as User,
        { transaction }
      );
    } else {
      if (claims.super && !user.super) {
        throw new AppError("ERR_SUPPLIER_SSO_INVALID", 403);
      }
      // A source administrator cannot turn a local super user into a regular
      // user, nor can a regular account gain global privileges by a claim.
      await user.update(
        {
          name: claims.name.trim(),
          profile: claims.profile,
          super: user.super || claims.super
        },
        { transaction }
      );
    }
    return user.id;
  });

  const user = await User.findByPk(userId, {
    include: ["queues", { model: Company, include: [Setting] }]
  });
  if (!user) throw new AppError("ERR_SUPPLIER_SSO_INVALID", 401);
  return {
    token: createAccessToken(user),
    refreshToken: createRefreshToken(user),
    user: await SerializeUser(user)
  };
};
