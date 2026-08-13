import { Request, Response } from "express";
import mcpConfig from "../config/mcp";
import AppError from "../errors/AppError";
import {
  approveAuthorization,
  authenticateAdmin,
  createAuthorizationRequest,
  exchangeAuthorizationCode,
  loadAuthorizationRequest,
  registerClient,
  revokeToken,
  rotateRefreshToken
} from "../services/McpServices/OAuthService";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, char => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    };
    return entities[char];
  });

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
  const request = await loadAuthorizationRequest(handle);
  const scopes = request.scopes
    .map(scope => `<li>${escapeHtml(scope)}</li>`)
    .join("");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
  );
  res.setHeader("Cache-Control", "no-store");
  return res
    .type("html")
    .send(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorizar ChatGPT</title><style>body{font-family:system-ui;background:#f4f5f7;margin:0;color:#1f2937}.card{max-width:520px;margin:6vh auto;background:white;padding:32px;border-radius:16px;box-shadow:0 8px 30px #0001}h1{margin-top:0}.warning{background:#fff7ed;border:1px solid #fdba74;padding:14px;border-radius:8px}label{display:block;margin-top:16px;font-weight:600}input[type=text],input[type=email],input[type=password]{width:100%;box-sizing:border-box;padding:12px;margin-top:6px;border:1px solid #bbb;border-radius:7px}.consent{display:flex;gap:10px;font-weight:400}.actions{display:flex;gap:12px;margin-top:24px}button{padding:11px 18px;border:0;border-radius:7px;cursor:pointer}.approve{background:#163cff;color:white}.cancel{background:#e5e7eb}</style></head><body><main class="card"><h1>Conectar Ticketz ao ChatGPT</h1><p>Entre como administrador do tenant e confirme os acessos solicitados:</p><ul>${scopes}</ul><p class="warning"><strong>Atenção:</strong> conversas identificáveis e possíveis dados clínicos poderão ser transmitidos ao ChatGPT conforme suas solicitações.</p><form method="post" action="${escapeHtml(mcpConfig.issuer)}/oauth/authorize/approve"><input type="hidden" name="handle" value="${escapeHtml(handle)}"><label>Tenant<input type="text" name="slug" required autocomplete="organization"></label><label>E-mail<input type="email" name="email" required autocomplete="username"></label><label>Senha<input type="password" name="password" required autocomplete="current-password"></label><label class="consent"><input type="checkbox" name="consent" value="yes" required>Compreendo e autorizo o compartilhamento dos dados dentro dos escopos acima.</label><div class="actions"><button class="approve" type="submit">Autorizar</button><button class="cancel" type="submit" formaction="${escapeHtml(mcpConfig.issuer)}/oauth/authorize/cancel" formnovalidate>Cancelar</button></div></form></main></body></html>`
    );
};

export const approve = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.body.consent !== "yes") throw new AppError("consent_required", 400);
  const request = await loadAuthorizationRequest(req.body.handle, true);
  try {
    const { user, company } = await authenticateAdmin(
      String(req.body.slug || ""),
      String(req.body.email || ""),
      String(req.body.password || "")
    );
    const code = await approveAuthorization(request, user, company);
    const url = new URL(request.redirectUri);
    url.searchParams.set("code", code);
    if (request.state) url.searchParams.set("state", request.state);
    res.redirect(303, url.toString());
    return res;
  } catch (error) {
    if (error instanceof AppError && [401, 403].includes(error.statusCode)) {
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
  const request = await loadAuthorizationRequest(req.body.handle, true);
  return redirectWithOAuthError(
    res,
    request.redirectUri,
    request.state,
    "access_denied"
  );
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
