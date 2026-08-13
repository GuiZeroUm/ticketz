import { randomBytes } from "crypto";
import { Request, Response } from "express";
import mcpConfig from "../config/mcp";
import AppError from "../errors/AppError";
import {
  approveAuthorization,
  authenticateAuthorizationPassword,
  consumeAuthorizationSelection,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  loadAuthorizationSession,
  loadAuthorizationRequest,
  registerClient,
  restartAuthorization,
  revokeToken,
  rotateRefreshToken,
  submitAuthorizationEmail,
  AuthorizationSession
} from "../services/McpServices/OAuthService";
import {
  renderAuthorizationPage,
  renderExpiredAuthorizationPage
} from "../views/OAuthAuthorizationView";

const authorizationNonce = (): string => randomBytes(18).toString("base64url");

const setAuthorizationPageHeaders = (res: Response, nonce: string): void => {
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
};

const sendAuthorizationPage = (
  res: Response,
  handle: string,
  session: AuthorizationSession,
  error?: string
): Response => {
  const nonce = authorizationNonce();
  setAuthorizationPageHeaders(res, nonce);
  return res.type("html").send(
    renderAuthorizationPage({
      nonce,
      issuer: mcpConfig.issuer,
      handle,
      request: session.request,
      step: session.step,
      email: session.email,
      memberships: session.memberships,
      error
    })
  );
};

const sendExpiredAuthorizationPage = (res: Response): Response => {
  const nonce = authorizationNonce();
  setAuthorizationPageHeaders(res, nonce);
  return res
    .status(400)
    .type("html")
    .send(renderExpiredAuthorizationPage(nonce));
};

const isExpiredAuthorization = (error: unknown): boolean =>
  error instanceof AppError &&
  ["authorization_request_expired", "authorization_flow_invalid"].includes(
    error.message
  );

const redirectWithOAuthError = (
  res: Response,
  redirectUri: string,
  state: string | undefined,
  error: string
): Response => {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  res.redirect(303, url.toString());
  return res;
};

export const protectedResourceMetadata = async (
  _req: Request,
  res: Response
): Promise<Response> =>
  res.json({
    resource: mcpConfig.resource,
    authorization_servers: [mcpConfig.issuer],
    scopes_supported: mcpConfig.scopes,
    bearer_methods_supported: ["header"],
    resource_documentation: `${mcpConfig.frontendUrl}/chatgpt`
  });

export const authorizationServerMetadata = async (
  _req: Request,
  res: Response
): Promise<Response> =>
  res.json({
    issuer: mcpConfig.issuer,
    authorization_endpoint: `${mcpConfig.issuer}/oauth/authorize`,
    token_endpoint: `${mcpConfig.issuer}/oauth/token`,
    registration_endpoint: `${mcpConfig.issuer}/oauth/register`,
    revocation_endpoint: `${mcpConfig.issuer}/oauth/revoke`,
    jwks_uri: `${mcpConfig.issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: mcpConfig.scopes
  });

export const jwks = async (_req: Request, res: Response): Promise<Response> =>
  res.json({
    keys: [
      {
        ...mcpConfig.publicJwk,
        kid: mcpConfig.keyId,
        use: "sig",
        alg: "RS256"
      }
    ]
  });

export const register = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const client = await registerClient(req.body || {});
  return res.status(201).json({
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"]
  });
};

export const authorize = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const handle = await createAuthorizationRequest({
    client_id: String(req.query.client_id || ""),
    redirect_uri: String(req.query.redirect_uri || ""),
    response_type: String(req.query.response_type || ""),
    state: typeof req.query.state === "string" ? req.query.state : undefined,
    scope: typeof req.query.scope === "string" ? req.query.scope : undefined,
    code_challenge: String(req.query.code_challenge || ""),
    code_challenge_method: String(req.query.code_challenge_method || ""),
    resource: String(req.query.resource || "")
  });
  const session = await loadAuthorizationSession(handle);
  return sendAuthorizationPage(res, handle, session);
};

export const submitEmail = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const handle = String(req.body.handle || "");
  try {
    const session = await submitAuthorizationEmail(
      handle,
      String(req.body.email || "")
    );
    return sendAuthorizationPage(res, handle, session);
  } catch (error) {
    if (isExpiredAuthorization(error)) return sendExpiredAuthorizationPage(res);
    if (error instanceof AppError && error.message === "invalid_email") {
      const session = await loadAuthorizationSession(handle);
      return sendAuthorizationPage(
        res,
        handle,
        session,
        "Digite um e-mail válido."
      );
    }
    throw error;
  }
};

export const submitPassword = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const handle = String(req.body.handle || "");
  try {
    const session = await authenticateAuthorizationPassword(
      handle,
      String(req.body.email || ""),
      String(req.body.password || "")
    );
    return sendAuthorizationPage(res, handle, session);
  } catch (error) {
    if (isExpiredAuthorization(error)) return sendExpiredAuthorizationPage(res);
    if (
      error instanceof AppError &&
      ["invalid_credentials", "no_eligible_company"].includes(error.message)
    ) {
      const session = await loadAuthorizationSession(handle);
      const message =
        error.message === "invalid_credentials"
          ? "E-mail ou senha inválidos."
          : "Nenhuma empresa disponível para esta conexão.";
      return sendAuthorizationPage(res, handle, session, message);
    }
    throw error;
  }
};

export const restart = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const handle = String(req.body.handle || "");
  try {
    const session = await restartAuthorization(handle);
    return sendAuthorizationPage(res, handle, session);
  } catch (error) {
    if (isExpiredAuthorization(error)) return sendExpiredAuthorizationPage(res);
    throw error;
  }
};

export const approve = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const handle = String(req.body.handle || "");
  try {
    const session = await loadAuthorizationSession(handle);
    if (session.step !== "company") {
      return sendExpiredAuthorizationPage(res);
    }
    if (req.body.consent !== "yes") {
      return sendAuthorizationPage(
        res,
        handle,
        session,
        "Confirme a autorização para continuar."
      );
    }
    const companyId = Number(req.body.companyId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      return sendAuthorizationPage(
        res,
        handle,
        session,
        "Selecione uma empresa válida."
      );
    }
    const { request, user, company } = await consumeAuthorizationSelection(
      handle,
      companyId
    );
    const code = await approveAuthorization(request, user, company);
    const url = new URL(request.redirectUri);
    url.searchParams.set("code", code);
    if (request.state) url.searchParams.set("state", request.state);
    res.redirect(303, url.toString());
    return res;
  } catch (error) {
    if (isExpiredAuthorization(error)) return sendExpiredAuthorizationPage(res);
    if (
      error instanceof AppError &&
      error.message === "invalid_company_selection"
    ) {
      const session = await loadAuthorizationSession(handle);
      return sendAuthorizationPage(
        res,
        handle,
        session,
        "Selecione uma empresa válida."
      );
    }
    if (error instanceof AppError && [401, 403].includes(error.statusCode)) {
      const request = await loadAuthorizationRequest(handle).catch(() => null);
      if (!request) return sendExpiredAuthorizationPage(res);
      return redirectWithOAuthError(
        res,
        request.redirectUri,
        request.state,
        "access_denied"
      );
    }
    throw error;
  }
};

export const cancel = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const request = await loadAuthorizationRequest(
      String(req.body.handle || ""),
      true
    );
    return redirectWithOAuthError(
      res,
      request.redirectUri,
      request.state,
      "access_denied"
    );
  } catch (error) {
    if (isExpiredAuthorization(error)) return sendExpiredAuthorizationPage(res);
    throw error;
  }
};

export const token = async (req: Request, res: Response): Promise<Response> => {
  let payload;
  if (req.body.grant_type === "authorization_code") {
    payload = await exchangeAuthorizationCode({
      code: req.body.code,
      codeVerifier: req.body.code_verifier,
      clientId: req.body.client_id,
      redirectUri: req.body.redirect_uri,
      resource: req.body.resource
    });
  } else if (req.body.grant_type === "refresh_token") {
    payload = await rotateRefreshToken({
      refreshToken: req.body.refresh_token,
      clientId: req.body.client_id,
      resource: req.body.resource
    });
  } else {
    throw new AppError("unsupported_grant_type", 400);
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  return res.json(payload);
};

export const revoke = async (
  req: Request,
  res: Response
): Promise<Response> => {
  await revokeToken(String(req.body.token || ""));
  return res.status(200).send();
};
