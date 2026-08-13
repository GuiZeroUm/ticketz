import { createHash, randomBytes, randomUUID } from "crypto";
import { compare } from "bcryptjs";
import { Op, Transaction } from "sequelize";
import { sign, verify } from "jsonwebtoken";
import sequelize from "../../database";
import mcpConfig from "../../config/mcp";
import Company from "../../models/Company";
import McpAudit from "../../models/McpAudit";
import OAuthClient from "../../models/OAuthClient";
import OAuthGrant from "../../models/OAuthGrant";
import OAuthRefreshToken from "../../models/OAuthRefreshToken";
import Setting from "../../models/Setting";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import { cacheLayer } from "../../libs/cache";

export type McpAuthContext = {
  grantId: string;
  userId: number;
  companyId: number;
  clientId: string;
  scopes: string[];
  expiresAt: number;
};

export type AuthorizationRequest = {
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge: string;
  resource: string;
  scopes: string[];
};

export type AuthorizationMembership = {
  userId: number;
  companyId: number;
  companyName: string;
  tokenVersion: number;
};

export type AuthorizationSession = {
  request: AuthorizationRequest;
  step: "email" | "password" | "company";
  expiresAt: number;
  email?: string;
  memberships?: AuthorizationMembership[];
};

type AuthorizationCode = AuthorizationRequest & {
  grantId: string;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const base64UrlSha256 = (value: string): string =>
  createHash("sha256").update(value).digest("base64url");
const opaqueToken = (): string => randomBytes(48).toString("base64url");
const validPkceValue = (value: string): boolean =>
  /^[A-Za-z0-9._~-]{43,128}$/.test(value);
const AUTHORIZATION_TTL_SECONDS = 600;
const DUMMY_PASSWORD_HASH =
  "$2a$08$7EqJtq98hPqEX7fNZaFWoO5hP6O8jLZd31QKJjV2VnPqM5LQyHf4K";

const authorizationKey = (handle: string): string =>
  `mcp:authorize:${sha256(handle || "")}`;

export const auditOAuth = async (
  event: string,
  status: string,
  context: {
    grantId?: string;
    userId?: number;
    companyId?: number;
  } = {}
): Promise<void> => {
  await McpAudit.create({
    correlationId: randomUUID(),
    grantId: context.grantId,
    userId: context.userId,
    companyId: context.companyId,
    event,
    status
  });
};

const saveAuthorizationSession = async (
  handle: string,
  session: AuthorizationSession
): Promise<void> => {
  const remainingTtl = Math.ceil((session.expiresAt - Date.now()) / 1000);
  if (remainingTtl <= 0) {
    throw new AppError("authorization_request_expired", 400);
  }
  await cacheLayer.set(
    authorizationKey(handle),
    JSON.stringify(session),
    "EX",
    remainingTtl
  );
};

export const validateScopes = (scope?: string): string[] => {
  const requested = (scope || mcpConfig.scopes.join(" "))
    .split(/\s+/)
    .filter(Boolean);
  if (
    requested.length === 0 ||
    requested.some(item => !mcpConfig.scopes.includes(item))
  ) {
    throw new AppError("invalid_scope", 400);
  }
  return [...new Set(requested)];
};

export const validateRedirectUri = (uri: string): void => {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new AppError("invalid_redirect_uri", 400);
  }

  const productionChatGpt =
    parsed.protocol === "https:" &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.hash === "" &&
    parsed.hostname === "chatgpt.com" &&
    (/^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(parsed.pathname) ||
      parsed.pathname === "/connector_platform_oauth_redirect");
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    ["http:", "https:"].includes(parsed.protocol) &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.hash === "" &&
    ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);

  if (!productionChatGpt && !localDevelopment) {
    throw new AppError("invalid_redirect_uri", 400);
  }
};

export const createPkceChallenge = (verifier: string): string =>
  base64UrlSha256(verifier);

export const hashOAuthToken = (token: string): string => sha256(token);

export const registerClient = async (body: {
  client_name?: string;
  redirect_uris?: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
}): Promise<OAuthClient> => {
  if (
    !Array.isArray(body.redirect_uris) ||
    body.redirect_uris.length === 0 ||
    body.redirect_uris.length > 5
  ) {
    throw new AppError("invalid_client_metadata", 400);
  }
  if (
    (body.grant_types &&
      (body.grant_types.length !== 2 ||
        !["authorization_code", "refresh_token"].every(item =>
          body.grant_types.includes(item)
        ))) ||
    (body.response_types &&
      (body.response_types.length !== 1 || body.response_types[0] !== "code"))
  ) {
    throw new AppError("invalid_client_metadata", 400);
  }
  body.redirect_uris.forEach(validateRedirectUri);
  if (
    body.token_endpoint_auth_method &&
    body.token_endpoint_auth_method !== "none"
  ) {
    throw new AppError("invalid_client_metadata", 400);
  }

  const clientId = `ticketz_${randomBytes(24).toString("base64url")}`;
  const client = await OAuthClient.create({
    clientId,
    clientName: String(body.client_name || "ChatGPT").slice(0, 120),
    redirectUris: body.redirect_uris,
    tokenEndpointAuthMethod: "none",
    active: true
  });
  await auditOAuth("oauth_client_registered", "success");
  return client;
};

export const createAuthorizationRequest = async (
  input: Record<string, string | undefined>
): Promise<string> => {
  const client = await OAuthClient.findOne({
    where: { clientId: input.client_id, active: true }
  });
  if (!client || !client.redirectUris.includes(input.redirect_uri)) {
    throw new AppError("invalid_client", 400);
  }
  validateRedirectUri(input.redirect_uri);
  if (
    input.response_type !== "code" ||
    input.code_challenge_method !== "S256" ||
    !validPkceValue(input.code_challenge || "") ||
    (input.state?.length || 0) > 2048
  ) {
    throw new AppError("invalid_request", 400);
  }
  if (input.resource !== mcpConfig.resource) {
    throw new AppError("invalid_target", 400);
  }

  const handle = opaqueToken();
  const request: AuthorizationRequest = {
    clientId: client.clientId,
    redirectUri: input.redirect_uri,
    state: input.state,
    codeChallenge: input.code_challenge,
    resource: input.resource,
    scopes: validateScopes(input.scope)
  };
  await saveAuthorizationSession(handle, {
    request,
    step: "email",
    expiresAt: Date.now() + AUTHORIZATION_TTL_SECONDS * 1000
  });
  await auditOAuth("oauth_authorization_started", "success");
  return handle;
};

export const loadAuthorizationSession = async (
  handle: string,
  consume = false
): Promise<AuthorizationSession> => {
  const key = authorizationKey(handle);
  const raw = consume
    ? await cacheLayer.consume(key)
    : await cacheLayer.get(key);
  if (!raw) throw new AppError("authorization_request_expired", 400);
  const parsed = JSON.parse(raw) as AuthorizationSession;
  if (
    !parsed.request ||
    !parsed.step ||
    !parsed.expiresAt ||
    parsed.expiresAt <= Date.now()
  ) {
    throw new AppError("authorization_flow_invalid", 400);
  }
  return parsed;
};

export const loadAuthorizationRequest = async (
  handle: string,
  consume = false
): Promise<AuthorizationRequest> =>
  (await loadAuthorizationSession(handle, consume)).request;

export const submitAuthorizationEmail = async (
  handle: string,
  email: string
): Promise<AuthorizationSession> => {
  const normalizedEmail = email.trim().toLowerCase();
  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw new AppError("invalid_email", 400);
  }

  const session = await loadAuthorizationSession(handle);
  if (session.step !== "email") {
    throw new AppError("authorization_flow_invalid", 400);
  }
  const updated: AuthorizationSession = {
    request: session.request,
    step: "password",
    expiresAt: session.expiresAt,
    email: normalizedEmail
  };
  await saveAuthorizationSession(handle, updated);
  await auditOAuth("oauth_email_submitted", "success");
  return updated;
};

export const restartAuthorization = async (
  handle: string
): Promise<AuthorizationSession> => {
  const session = await loadAuthorizationSession(handle);
  const restarted: AuthorizationSession = {
    request: session.request,
    step: "email",
    expiresAt: session.expiresAt,
    email: session.email
  };
  await saveAuthorizationSession(handle, restarted);
  return restarted;
};

export const authenticateAuthorizationPassword = async (
  handle: string,
  email: string,
  password: string
): Promise<AuthorizationSession> => {
  const session = await loadAuthorizationSession(handle);
  if (session.step !== "password" || !session.email) {
    throw new AppError("authorization_flow_invalid", 400);
  }
  if (session.email !== email.trim().toLowerCase()) {
    throw new AppError("authorization_flow_invalid", 400);
  }

  const users = await User.findAll({
    where: {
      profile: "admin",
      [Op.and]: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("User.email")),
        session.email
      )
    },
    include: [Company],
    order: [["companyId", "ASC"]]
  });

  if (users.length === 0) {
    await compare(password || "", DUMMY_PASSWORD_HASH);
  }
  const passwordResults = await Promise.all(
    users.map(async user => ({
      user,
      matches: await user.checkPassword(password || "")
    }))
  );
  const matchingUsers = passwordResults
    .filter(result => result.matches)
    .map(result => result.user);

  if (matchingUsers.length === 0) {
    await auditOAuth("oauth_login", "invalid_credentials");
    throw new AppError("invalid_credentials", 401);
  }

  const memberships = (
    await Promise.all(
      matchingUsers.map(async user => {
        if (!user.company) return null;
        try {
          await assertCompanyEligible(user.company);
          return {
            userId: user.id,
            companyId: user.companyId,
            companyName: user.company.name,
            tokenVersion: user.tokenVersion
          } as AuthorizationMembership;
        } catch (error) {
          if (error instanceof AppError && error.statusCode === 403)
            return null;
          throw error;
        }
      })
    )
  ).filter(
    (membership): membership is AuthorizationMembership => membership !== null
  );

  if (memberships.length === 0) {
    await auditOAuth("oauth_login", "no_eligible_company");
    throw new AppError("no_eligible_company", 403);
  }

  const authenticated: AuthorizationSession = {
    request: session.request,
    step: "company",
    expiresAt: session.expiresAt,
    email: session.email,
    memberships
  };
  await saveAuthorizationSession(handle, authenticated);
  await auditOAuth("oauth_login", "success");
  return authenticated;
};

const pilotEnabled = async (companyId: number): Promise<boolean> => {
  const setting = await Setting.findOne({
    where: { companyId, key: "_mcpEnabled" }
  });
  return setting?.value === "enabled" || setting?.value === "true";
};

export const assertCompanyEligible = async (
  company: Company
): Promise<void> => {
  if (company.status === false) throw new AppError("company_inactive", 403);
  if (company.id !== 1 && company.dueDate) {
    const due = new Date(`${company.dueDate}T23:59:59.999`);
    const graceSetting = await Setting.findOne({
      where: { companyId: 1, key: "gracePeriod" }
    });
    due.setDate(due.getDate() + (Number(graceSetting?.value) || 0));
    if (Number.isFinite(due.getTime()) && due < new Date()) {
      throw new AppError("company_not_compliant", 403);
    }
  }
  if (!(await pilotEnabled(company.id))) {
    throw new AppError("mcp_pilot_disabled", 403);
  }
};

export const consumeAuthorizationSelection = async (
  handle: string,
  companyId: number
): Promise<{
  request: AuthorizationRequest;
  user: User;
  company: Company;
}> => {
  const pending = await loadAuthorizationSession(handle);
  const pendingMembership = pending.memberships?.find(
    membership => membership.companyId === companyId
  );
  if (pending.step !== "company" || !pendingMembership) {
    throw new AppError("invalid_company_selection", 400);
  }

  const claimed = await loadAuthorizationSession(handle, true);
  const membership = claimed.memberships?.find(
    item => item.companyId === companyId
  );
  if (claimed.step !== "company" || !membership) {
    throw new AppError("authorization_flow_invalid", 400);
  }

  const user = await User.findOne({
    where: {
      id: membership.userId,
      companyId: membership.companyId,
      profile: "admin",
      tokenVersion: membership.tokenVersion
    },
    include: [Company]
  });
  if (!user?.company) throw new AppError("access_denied", 403);
  await assertCompanyEligible(user.company);
  return { request: claimed.request, user, company: user.company };
};

export const approveAuthorization = async (
  request: AuthorizationRequest,
  user: User,
  company: Company
): Promise<string> => {
  const client = await OAuthClient.findOne({
    where: { clientId: request.clientId, active: true }
  });
  if (!client) throw new AppError("invalid_client", 400);
  const grant = await OAuthGrant.create({
    oauthClientId: client.id,
    userId: user.id,
    companyId: company.id,
    scopes: request.scopes,
    tokenVersion: user.tokenVersion,
    active: true
  });
  const code = opaqueToken();
  const payload: AuthorizationCode = { ...request, grantId: grant.id };
  await cacheLayer.set(
    `mcp:code:${sha256(code)}`,
    JSON.stringify(payload),
    "EX",
    600
  );
  await auditOAuth("oauth_grant_created", "success", {
    grantId: grant.id,
    userId: user.id,
    companyId: company.id
  });
  return code;
};

const issueAccessToken = (grant: OAuthGrant): string =>
  sign(
    {
      company_id: grant.companyId,
      grant_id: grant.id,
      scope: grant.scopes.join(" "),
      jti: randomUUID()
    },
    mcpConfig.privateKey,
    {
      algorithm: "RS256",
      keyid: mcpConfig.keyId,
      issuer: mcpConfig.issuer,
      audience: mcpConfig.resource,
      subject: String(grant.userId),
      expiresIn: "15m",
      header: { alg: "RS256", typ: "JWT" }
    }
  );

const createRefreshToken = async (
  grant: OAuthGrant,
  familyId = randomUUID(),
  absoluteExpiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
  transaction?: Transaction
): Promise<string> => {
  const token = opaqueToken();
  const inactivityExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiresAt =
    inactivityExpiry < absoluteExpiresAt ? inactivityExpiry : absoluteExpiresAt;
  await OAuthRefreshToken.create(
    {
      grantId: grant.id,
      familyId,
      tokenHash: sha256(token),
      expiresAt,
      absoluteExpiresAt
    },
    { transaction }
  );
  return token;
};

const tokenResponse = async (grant: OAuthGrant, refreshToken?: string) => ({
  access_token: issueAccessToken(grant),
  token_type: "Bearer",
  expires_in: 900,
  refresh_token: refreshToken || (await createRefreshToken(grant)),
  scope: grant.scopes.join(" "),
  resource: mcpConfig.resource
});

export const exchangeAuthorizationCode = async (input: {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
  resource: string;
}) => {
  if (input.resource !== mcpConfig.resource)
    throw new AppError("invalid_target", 400);
  const raw = await cacheLayer.consume(`mcp:code:${sha256(input.code || "")}`);
  if (!raw) throw new AppError("invalid_grant", 400);
  const code = JSON.parse(raw) as AuthorizationCode;
  if (
    !validPkceValue(input.codeVerifier || "") ||
    code.clientId !== input.clientId ||
    code.redirectUri !== input.redirectUri ||
    code.resource !== input.resource ||
    base64UrlSha256(input.codeVerifier || "") !== code.codeChallenge
  ) {
    throw new AppError("invalid_grant", 400);
  }
  const grant = await OAuthGrant.findByPk(code.grantId, {
    include: [OAuthClient]
  });
  if (!grant?.active || !grant.oauthClient?.active) {
    throw new AppError("invalid_grant", 400);
  }
  const response = await tokenResponse(grant);
  await auditOAuth("oauth_access_issued", "success", {
    grantId: grant.id,
    userId: grant.userId,
    companyId: grant.companyId
  });
  return response;
};

export const rotateRefreshToken = async (input: {
  refreshToken: string;
  clientId: string;
  resource: string;
}) => {
  if (input.resource !== mcpConfig.resource)
    throw new AppError("invalid_target", 400);
  let reuseDetected = false;
  let reuseContext: {
    grantId: string;
    userId: number;
    companyId: number;
  } | null = null;
  const response = await sequelize.transaction(async transaction => {
    const current = await OAuthRefreshToken.findOne({
      where: { tokenHash: sha256(input.refreshToken || "") },
      include: [{ model: OAuthGrant, include: [OAuthClient] }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!current) throw new AppError("invalid_grant", 400);
    if (current.usedAt || current.revokedAt) {
      await OAuthRefreshToken.update(
        { revokedAt: new Date() },
        { where: { familyId: current.familyId }, transaction }
      );
      await OAuthGrant.update(
        { active: false, revokedAt: new Date() },
        { where: { id: current.grantId }, transaction }
      );
      reuseDetected = true;
      reuseContext = {
        grantId: current.grantId,
        userId: current.grant.userId,
        companyId: current.grant.companyId
      };
      return null;
    }
    if (
      current.expiresAt < new Date() ||
      current.absoluteExpiresAt < new Date() ||
      !current.grant?.active ||
      current.grant.oauthClient?.clientId !== input.clientId
    ) {
      throw new AppError("invalid_grant", 400);
    }
    await current.update({ usedAt: new Date() }, { transaction });
    const replacement = await createRefreshToken(
      current.grant,
      current.familyId,
      current.absoluteExpiresAt,
      transaction
    );
    return {
      tokens: await tokenResponse(current.grant, replacement),
      grantId: current.grant.id,
      userId: current.grant.userId,
      companyId: current.grant.companyId
    };
  });
  if (reuseDetected || !response) {
    await auditOAuth(
      "oauth_refresh_reuse",
      "grant_revoked",
      reuseContext || {}
    );
    throw new AppError("invalid_grant", 400);
  }
  await auditOAuth("oauth_refresh_rotated", "success", {
    grantId: response.grantId,
    userId: response.userId,
    companyId: response.companyId
  });
  return response.tokens;
};

export const validateAccessToken = async (
  token: string
): Promise<McpAuthContext> => {
  let payload: Record<string, unknown>;
  try {
    payload = verify(token, mcpConfig.publicKey, {
      algorithms: ["RS256"],
      issuer: mcpConfig.issuer,
      audience: mcpConfig.resource
    }) as Record<string, unknown>;
  } catch {
    throw new AppError("invalid_token", 401);
  }
  if (
    typeof payload.jti !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    typeof payload.grant_id !== "string" ||
    typeof payload.sub !== "string" ||
    typeof payload.company_id !== "number"
  ) {
    throw new AppError("invalid_token", 401);
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.iat > now + 60 || payload.exp <= now) {
    throw new AppError("invalid_token", 401);
  }
  const grant = await OAuthGrant.findByPk(payload.grant_id, {
    include: [User, Company, OAuthClient]
  });
  if (
    !grant?.active ||
    grant.revokedAt ||
    !grant.user ||
    grant.user.profile !== "admin" ||
    grant.user.tokenVersion !== grant.tokenVersion ||
    grant.user.id !== Number(payload.sub) ||
    grant.user.companyId !== grant.companyId ||
    grant.companyId !== payload.company_id ||
    !grant.oauthClient?.active
  ) {
    throw new AppError("invalid_token", 401);
  }
  try {
    await assertCompanyEligible(grant.company);
  } catch {
    throw new AppError("invalid_token", 401);
  }
  const scopes = String(payload.scope || "")
    .split(/\s+/)
    .filter(Boolean);
  if (
    scopes.length === 0 ||
    scopes.some(scope => !mcpConfig.scopes.includes(scope)) ||
    scopes.some(scope => !grant.scopes.includes(scope))
  ) {
    throw new AppError("invalid_token", 401);
  }
  await grant.update({ lastUsedAt: new Date() });
  return {
    grantId: grant.id,
    userId: grant.userId,
    companyId: grant.companyId,
    clientId: grant.oauthClient.clientId,
    scopes,
    expiresAt: payload.exp
  };
};

export const revokeToken = async (token: string): Promise<void> => {
  const refresh = await OAuthRefreshToken.findOne({
    where: { tokenHash: sha256(token) }
  });
  if (refresh) {
    await OAuthRefreshToken.update(
      { revokedAt: new Date() },
      { where: { familyId: refresh.familyId } }
    );
    await OAuthGrant.update(
      { active: false, revokedAt: new Date() },
      { where: { id: refresh.grantId } }
    );
    return;
  }
  try {
    const payload = verify(token, mcpConfig.publicKey, {
      algorithms: ["RS256"],
      issuer: mcpConfig.issuer,
      audience: mcpConfig.resource,
      ignoreExpiration: true
    }) as Record<string, unknown>;
    if (typeof payload.grant_id === "string") {
      await OAuthGrant.update(
        { active: false, revokedAt: new Date() },
        { where: { id: payload.grant_id } }
      );
    }
  } catch {
    // RFC 7009 deliberately returns success for unknown tokens.
  }
};

export const revokeGrant = async (
  grantId: string,
  companyId: number
): Promise<boolean> => {
  const [count] = await OAuthGrant.update(
    { active: false, revokedAt: new Date() },
    { where: { id: grantId, companyId, active: true } }
  );
  return count > 0;
};

export const revokeAllCompanyGrants = async (
  companyId: number
): Promise<number> => {
  const [count] = await OAuthGrant.update(
    { active: false, revokedAt: new Date() },
    { where: { companyId, active: true } }
  );
  return count;
};
