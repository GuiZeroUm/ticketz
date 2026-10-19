/* eslint-disable @typescript-eslint/no-explicit-any */
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key";

const store = new Map<string, { value: string; expiresAt: number }>();
let clock = 1_000_000;

jest.mock("../../../libs/cache", () => ({
  cacheLayer: {
    set: jest.fn(
      async (key: string, value: string, mode?: string, ttl?: number) => {
        store.set(key, {
          value,
          expiresAt: mode === "EX" ? clock + Number(ttl) * 1000 : Infinity
        });
        return "OK";
      }
    ),
    consume: jest.fn(async (key: string) => {
      const entry = store.get(key);
      store.delete(key);
      if (!entry || entry.expiresAt <= clock) return null;
      return entry.value;
    })
  }
}));
jest.mock("../../../queues/email", () => ({ enqueueAccountSync: jest.fn() }));
jest.mock("../EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn()
}));
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Registers every model without opening a connection.
import "../../../database";

import crypto from "crypto";
import { Gaxios } from "gaxios";
import { cacheLayer } from "../../../libs/cache";
import { getIO } from "../../../libs/socket";
import { enqueueAccountSync } from "../../../queues/email";
import { logger } from "../../../utils/logger";
import EmailAccount from "../../../models/EmailAccount";
import Queue from "../../../models/Queue";
import { emailEnabledForCompany } from "../EmailAccessService";
import { disableEmailAccount } from "../EmailAccountService";
import { EmailAuthError, EmailTransientError } from "../adapters/errors";
import {
  CompleteGmailOAuthService,
  StartGmailOAuthService,
  getGmailAuthClient,
  persistRotatedRefreshToken,
  revokeGmailAccount
} from "../GmailOAuthService";

const READONLY = "https://www.googleapis.com/auth/gmail.readonly";
const SEND = "https://www.googleapis.com/auth/gmail.send";
const FRONTEND = "https://app.espacowhats.com.br";
const TENANT = "https://teste.espacowhats.com.br";
const CLIENT_SECRET = "client-secret-value-XYZ";
const REFRESH_TOKEN = "1//refresh-token-SECRET";
const ACCESS_TOKEN = "ya29.access-token-SECRET";
const AUTH_CODE = "4/0auth-code-SECRET";

type Sent = { url: string; method: string; body: string; headers: Headers };

let sent: Sent[] = [];
let tokenResponse: { status: number; body: any };
let refreshResponse: { status: number; body: any };
let profileResponse: { status: number; body: any };
let revokeResponse: { status: number; body: any };

const json = ({ status, body }: { status: number; body: any }) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

const fakeFetch = async (url: string, init: any): Promise<Response> => {
  const body =
    init.body instanceof URLSearchParams
      ? init.body.toString()
      : typeof init.body === "string"
        ? init.body
        : "";
  sent.push({
    url: String(url),
    method: init.method || "GET",
    body,
    headers: new Headers(init.headers)
  });
  const target = new URL(String(url));
  if (
    target.origin + target.pathname ===
    "https://oauth2.googleapis.com/token"
  ) {
    const grant = new URLSearchParams(body).get("grant_type");
    return json(grant === "refresh_token" ? refreshResponse : tokenResponse);
  }
  if (
    target.origin + target.pathname ===
    "https://gmail.googleapis.com/gmail/v1/users/me/profile"
  ) {
    return json(profileResponse);
  }
  if (
    target.origin + target.pathname ===
    "https://oauth2.googleapis.com/revoke"
  ) {
    return json(revokeResponse);
  }
  return json({ status: 404, body: { error: "not_found" } });
};

const originalAdapter = (Gaxios.prototype as any)._defaultAdapter;

const sentTo = (path: string) => sent.filter(item => item.url.includes(path));
const redirectParams = (redirectTo: string) => new URL(redirectTo);

const emit = jest.fn();
const roomTo = jest.fn();

let accounts: EmailAccount[] = [];
let nextId = 50;

const matches = (row: any, where: any = {}): boolean =>
  Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const [symbol] = Object.getOwnPropertySymbols(value);
      if (symbol) return row[key] !== (value as any)[symbol];
      return true;
    }
    return row[key] === value;
  });

const makeAccount = (values: Record<string, any>, refreshToken?: string) => {
  const account = EmailAccount.build({
    id: nextId++,
    companyId: 1,
    provider: "gmail_api",
    preset: "gmail",
    name: "Gmail",
    address: "caixa@gmail.com",
    status: "active",
    scopes: [READONLY, SEND],
    errorCount: 0,
    updatedAt: new Date("2026-10-19T10:00:00.000Z"),
    ...values
  } as any);
  if (refreshToken) account.setCredentials({ refreshToken });
  accounts.push(account);
  return account;
};

const loggedText = () =>
  JSON.stringify(
    ["info", "warn", "error", "debug"].flatMap(
      level => (logger as any)[level].mock.calls
    )
  );

const start = (overrides: Record<string, any> = {}) =>
  StartGmailOAuthService({
    companyId: 1,
    userId: 100,
    name: "Suporte Gmail",
    queueId: null,
    origin: TENANT,
    ...overrides
  });

const stateOf = (url: string) => new URL(url).searchParams.get("state");

const recordOf = (state: string) =>
  JSON.parse(store.get(`email:oauth:state:${state}`)!.value);

beforeEach(() => {
  jest.clearAllMocks();
  store.clear();
  clock = 1_000_000;
  sent = [];
  accounts = [];
  nextId = 50;
  process.env.GMAIL_OAUTH_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GMAIL_OAUTH_CLIENT_SECRET = CLIENT_SECRET;
  process.env.GMAIL_OAUTH_REDIRECT_URI =
    "https://app.espacowhats.com.br/backend/email/oauth/google/callback";
  process.env.FRONTEND_URL = `${FRONTEND}/`;
  process.env.FRONTEND_URL_REGEX =
    "^https://[a-z0-9-]+\\.espacowhats\\.com\\.br$";
  delete process.env.FRONTEND_CUSTOM_URL;

  tokenResponse = {
    status: 200,
    body: {
      access_token: ACCESS_TOKEN,
      refresh_token: REFRESH_TOKEN,
      expires_in: 3599,
      token_type: "Bearer",
      scope: `${SEND} ${READONLY}`
    }
  };
  refreshResponse = {
    status: 200,
    body: { access_token: "ya29.refreshed-SECRET", expires_in: 3599 }
  };
  profileResponse = {
    status: 200,
    body: { emailAddress: "Caixa@Gmail.com", historyId: "98765" }
  };
  revokeResponse = { status: 200, body: {} };

  jest
    .spyOn(Gaxios.prototype as any, "_defaultAdapter")
    .mockImplementation(function adapter(this: unknown, config: any) {
      return originalAdapter.call(this, {
        ...config,
        fetchImplementation: fakeFetch
      });
    });

  (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
  (enqueueAccountSync as jest.Mock).mockResolvedValue(undefined);
  roomTo.mockReturnValue({ to: roomTo, emit });
  (getIO as jest.Mock).mockReturnValue({ to: roomTo });

  jest
    .spyOn(Queue, "findOne")
    .mockImplementation((async (options: any) =>
      options.where.companyId === 1 && options.where.id === 5
        ? { id: 5 }
        : null) as any);
  const findOne = async (options: any) =>
    accounts.find(item => matches(item, options.where)) || null;
  jest.spyOn(EmailAccount, "scope").mockReturnValue({ findOne } as any);
  jest.spyOn(EmailAccount, "findOne").mockImplementation(findOne as any);
  jest
    .spyOn(EmailAccount, "count")
    .mockImplementation(
      (async (options: any) =>
        accounts.filter(item => matches(item, options.where)).length) as any
    );
  jest
    .spyOn(EmailAccount.prototype, "save")
    .mockImplementation(async function save(this: EmailAccount) {
      if (!this.id) this.id = nextId++;
      if (!accounts.includes(this)) accounts.push(this);
      return this;
    });
});

// gaxios lazily imports a proxy agent when a proxy is configured, which jest
// cannot do without --experimental-vm-modules; the fake transport needs none.
const PROXY_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"];
const savedProxy: Record<string, string | undefined> = {};

beforeAll(() => {
  PROXY_KEYS.forEach(key => {
    savedProxy[key] = process.env[key];
    delete process.env[key];
  });
});

afterAll(() => {
  jest.restoreAllMocks();
  PROXY_KEYS.forEach(key => {
    if (savedProxy[key] !== undefined) process.env[key] = savedProxy[key];
  });
});

describe("StartGmailOAuthService", () => {
  it("start builds a URL with offline access, PKCE and exactly gmail.readonly + gmail.send", async () => {
    const { url } = await start();
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    const params = parsed.searchParams;
    expect(params.get("client_id")).toBe(
      "client-id.apps.googleusercontent.com"
    );
    expect(params.get("redirect_uri")).toBe(
      process.env.GMAIL_OAUTH_REDIRECT_URI
    );
    expect(params.get("response_type")).toBe("code");
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("prompt")).toBe("consent");
    // incremental consent must not merge the login (Clerk) scopes
    expect(params.get("include_granted_scopes")).toBe("false");
    expect(params.get("scope")!.split(" ").sort()).toEqual([READONLY, SEND]);
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(url).not.toContain(CLIENT_SECRET);
    expect(url).not.toMatch(/gmail\.modify|mail\.google\.com/);

    const state = params.get("state")!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const record = recordOf(state);
    expect(record).toEqual({
      companyId: 1,
      userId: 100,
      name: "Suporte Gmail",
      queueId: null,
      codeVerifier: expect.any(String),
      origin: TENANT
    });
    const challenge = crypto
      .createHash("sha256")
      .update(record.codeVerifier)
      .digest("base64url");
    expect(params.get("code_challenge")).toBe(challenge);
    expect(url).not.toContain(record.codeVerifier);
    expect(cacheLayer.set).toHaveBeenCalledWith(
      `email:oauth:state:${state}`,
      expect.any(String),
      "EX",
      600
    );
    expect(sent).toHaveLength(0);
  });

  it("uses a different random state on every start", async () => {
    const first = stateOf((await start()).url);
    const second = stateOf((await start()).url);
    expect(first).not.toBe(second);
  });

  it("refuses with ERR_GMAIL_NOT_CONFIGURED when the client is not configured", async () => {
    delete process.env.GMAIL_OAUTH_CLIENT_SECRET;
    await expect(start()).rejects.toMatchObject({
      message: "ERR_GMAIL_NOT_CONFIGURED"
    });
    expect(store.size).toBe(0);
  });

  it("refuses a queue of another company and a malformed name", async () => {
    await expect(start({ queueId: 9 })).rejects.toMatchObject({
      message: "ERR_QUEUE_NOT_FOUND"
    });
    await expect(start({ name: { $gt: "" } })).rejects.toMatchObject({
      message: "ERR_EMAIL_INVALID_ACCOUNT"
    });
    expect(store.size).toBe(0);

    const { url } = await start({ queueId: 5, name: "  " });
    expect(recordOf(stateOf(url)!)).toMatchObject({ queueId: 5, name: null });
  });

  it.each([
    ["an unknown site", "https://evil.example"],
    ["a suffix trick", "https://teste.espacowhats.com.br.evil.com"],
    ["a userinfo trick", "https://teste.espacowhats.com.br@evil.com"],
    ["a path smuggling the domain", "https://evil.com/.espacowhats.com.br"],
    ["a non-http scheme", "javascript:alert(1)"],
    ["the opaque null origin", "null"],
    ["no origin", undefined]
  ])("records FRONTEND_URL instead of %s", async (_label, origin) => {
    const { url } = await start({ origin });
    expect(recordOf(stateOf(url)!).origin).toBe(FRONTEND);
  });

  it("records an allowed custom frontend origin", async () => {
    process.env.FRONTEND_CUSTOM_URL = "https://painel.cliente.com, https://x.y";
    const { url } = await start({ origin: "https://painel.cliente.com" });
    expect(recordOf(stateOf(url)!).origin).toBe("https://painel.cliente.com");
  });
});

describe("CompleteGmailOAuthService", () => {
  const connect = async (startOverrides: Record<string, any> = {}) => {
    const { url } = await start(startOverrides);
    const state = stateOf(url)!;
    const result = await CompleteGmailOAuthService({ code: AUTH_CODE, state });
    return { state, ...result };
  };

  it("callback rejects unknown, expired or reused state", async () => {
    const unknown = await CompleteGmailOAuthService({
      code: AUTH_CODE,
      state: crypto.randomBytes(32).toString("base64url")
    });
    expect(unknown.redirectTo).toBe(
      `${FRONTEND}/connections?email=error&code=ERR_GMAIL_STATE`
    );

    // expired: the record outlived its 600 s TTL
    const expiredState = stateOf((await start()).url)!;
    clock += 601 * 1000;
    const expired = await CompleteGmailOAuthService({
      code: AUTH_CODE,
      state: expiredState
    });
    expect(expired.redirectTo).toBe(
      `${FRONTEND}/connections?email=error&code=ERR_GMAIL_STATE`
    );
    expect(sent).toHaveLength(0);

    // reused: the first callback consumes it
    const { state, redirectTo } = await connect();
    expect(redirectParams(redirectTo).searchParams.get("email")).toBe(
      "connected"
    );
    sent = [];
    const replay = await CompleteGmailOAuthService({ code: AUTH_CODE, state });
    expect(replay.redirectTo).toBe(
      `${FRONTEND}/connections?email=error&code=ERR_GMAIL_STATE`
    );
    expect(sent).toHaveLength(0);
  });

  it.each([
    ["missing", undefined],
    ["an array", ["a", "b"]],
    ["too short", "abc"],
    ["not base64url", "!".repeat(43)]
  ])("rejects a %s state without touching Redis", async (_label, state) => {
    const { redirectTo } = await CompleteGmailOAuthService({
      code: AUTH_CODE,
      state
    });
    expect(redirectTo).toBe(
      `${FRONTEND}/connections?email=error&code=ERR_GMAIL_STATE`
    );
    expect(cacheLayer.consume).not.toHaveBeenCalled();
  });

  it("burns the state when Google returns an error and redirects to the initiating tenant", async () => {
    const state = stateOf((await start()).url)!;
    const denied = await CompleteGmailOAuthService({
      error: "access_denied",
      state
    });
    expect(denied.redirectTo).toBe(
      `${TENANT}/connections?email=error&code=ERR_GMAIL_STATE`
    );
    expect(sent).toHaveLength(0);
    const again = await CompleteGmailOAuthService({ code: AUTH_CODE, state });
    expect(again.redirectTo).toBe(
      `${FRONTEND}/connections?email=error&code=ERR_GMAIL_STATE`
    );
  });

  it("never redirects to an origin that fails validation, even one stored in Redis", async () => {
    const state = stateOf((await start()).url)!;
    const key = `email:oauth:state:${state}`;
    const record = JSON.parse(store.get(key)!.value);
    store.set(key, {
      value: JSON.stringify({ ...record, origin: "https://evil.example" }),
      expiresAt: Infinity
    });
    const { redirectTo } = await CompleteGmailOAuthService({
      code: AUTH_CODE,
      state
    });
    expect(new URL(redirectTo).origin).toBe(FRONTEND);
  });

  it("redirects back to the validated initiating tenant origin", async () => {
    const { redirectTo } = await connect({ origin: TENANT });
    expect(redirectTo).toBe(`${TENANT}/connections?email=connected`);
  });

  it("callback fails with ERR_GMAIL_SCOPES_MISSING and revokes when send scope is not granted", async () => {
    tokenResponse.body.scope = READONLY;
    const { redirectTo } = await connect();
    expect(redirectTo).toBe(
      `${TENANT}/connections?email=error&code=ERR_GMAIL_SCOPES_MISSING`
    );
    const revokes = sentTo("oauth2.googleapis.com/revoke");
    expect(revokes).toHaveLength(1);
    expect(revokes[0].method).toBe("POST");
    // the token travels in the body, never in the URL
    expect(revokes[0].url).not.toContain("SECRET");
    expect(new URLSearchParams(revokes[0].body).get("token")).toBe(
      REFRESH_TOKEN
    );
    expect(EmailAccount.prototype.save).not.toHaveBeenCalled();
    expect(enqueueAccountSync).not.toHaveBeenCalled();
  });

  it("callback fails with ERR_GMAIL_NO_REFRESH_TOKEN", async () => {
    delete tokenResponse.body.refresh_token;
    const { redirectTo } = await connect();
    expect(redirectTo).toBe(
      `${TENANT}/connections?email=error&code=ERR_GMAIL_NO_REFRESH_TOKEN`
    );
    expect(EmailAccount.prototype.save).not.toHaveBeenCalled();
    expect(enqueueAccountSync).not.toHaveBeenCalled();
  });

  it("callback upserts an active gmail account bound to the state's companyId and userId", async () => {
    const { redirectTo } = await connect({
      companyId: 1,
      userId: 100,
      queueId: 5
    });
    expect(redirectTo).toBe(`${TENANT}/connections?email=connected`);

    const exchange = sentTo("oauth2.googleapis.com/token");
    expect(exchange).toHaveLength(1);
    const form = new URLSearchParams(exchange[0].body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe(AUTH_CODE);
    expect(form.get("code_verifier")).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(form.get("client_secret")).toBe(CLIENT_SECRET);
    expect(form.get("redirect_uri")).toBe(process.env.GMAIL_OAUTH_REDIRECT_URI);
    const profile = sentTo("users/me/profile");
    expect(profile).toHaveLength(1);
    expect(profile[0].headers.get("authorization")).toBe(
      `Bearer ${ACCESS_TOKEN}`
    );

    expect(accounts).toHaveLength(1);
    const [account] = accounts;
    expect(account).toMatchObject({
      companyId: 1,
      connectedByUserId: 100,
      provider: "gmail_api",
      preset: "gmail",
      address: "caixa@gmail.com",
      name: "Suporte Gmail",
      queueId: 5,
      status: "active",
      errorCount: 0,
      lastError: null
    });
    expect([...account.scopes].sort()).toEqual([READONLY, SEND]);
    expect(account.getCredentials()).toEqual({ refreshToken: REFRESH_TOKEN });
    expect(account.getDataValue("syncCursor")).toEqual({
      historyId: "98765",
      initial: true
    });
    expect(enqueueAccountSync).toHaveBeenCalledWith(account.id);
    expect(emit).toHaveBeenCalledWith(
      "company-1-emailAccount",
      expect.objectContaining({
        action: "create",
        account: expect.objectContaining({ address: "caixa@gmail.com" })
      })
    );
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(
      /SECRET|credentials|syncCursor|refreshToken/
    );
    expect(redirectTo).not.toContain("SECRET");
  });

  it("falls back to the address when no name was given and drops a queue deleted meanwhile", async () => {
    const { url } = await start({ name: "", queueId: 5 });
    (Queue.findOne as jest.Mock).mockResolvedValue(null);
    await CompleteGmailOAuthService({ code: AUTH_CODE, state: stateOf(url) });
    expect(accounts[0]).toMatchObject({
      name: "caixa@gmail.com",
      queueId: null
    });
  });

  it("allows the same mailbox in another company as an independent row", async () => {
    const other = makeAccount({ companyId: 2, id: 7 }, "1//other-company");
    const { redirectTo } = await connect({ companyId: 1 });
    expect(redirectTo).toBe(`${TENANT}/connections?email=connected`);
    expect(accounts).toHaveLength(2);
    const created = accounts.find(item => item !== other)!;
    expect(created.companyId).toBe(1);
    expect(other.getCredentials()).toEqual({
      refreshToken: "1//other-company"
    });
  });

  it("reconnecting a gmail account that needs reauth reuses its row and keeps the cursor", async () => {
    const existing = makeAccount(
      {
        id: 9,
        status: "reauth_required",
        errorCount: 2,
        lastError: { code: "ERR_EMAIL_AUTH", at: "x" },
        syncCursor: { historyId: "111" }
      },
      "1//old-token"
    );
    const { redirectTo } = await connect();
    expect(redirectTo).toBe(`${TENANT}/connections?email=connected`);
    expect(accounts).toHaveLength(1);
    expect(existing).toMatchObject({
      status: "active",
      errorCount: 0,
      lastError: null,
      connectedByUserId: 100,
      name: "Suporte Gmail"
    });
    expect(existing.getCredentials()).toEqual({ refreshToken: REFRESH_TOKEN });
    expect(existing.getDataValue("syncCursor")).toEqual({ historyId: "111" });
    expect(enqueueAccountSync).toHaveBeenCalledWith(9);
    // the old token is not revoked: that would revoke the new grant too
    expect(sentTo("revoke")).toHaveLength(0);
  });

  it("reconnecting a disabled gmail account reuses its row with a fresh initial cursor", async () => {
    const existing = makeAccount({
      id: 9,
      status: "disabled",
      syncCursor: null,
      lastSyncAt: new Date()
    });
    await connect();
    expect(existing.status).toBe("active");
    expect(existing.lastSyncAt).toBeNull();
    expect(existing.getDataValue("syncCursor")).toEqual({
      historyId: "98765",
      initial: true
    });
    expect(emit).toHaveBeenCalledWith(
      "company-1-emailAccount",
      expect.objectContaining({ action: "create" })
    );
  });

  it("refuses a mailbox already connected through IMAP/SMTP and revokes the unused grant", async () => {
    const imap = makeAccount({
      id: 9,
      provider: "imap_smtp",
      preset: "custom",
      status: "disabled"
    });
    const { redirectTo } = await connect();
    expect(redirectTo).toBe(
      `${TENANT}/connections?email=error&code=ERR_EMAIL_ACCOUNT_EXISTS`
    );
    expect(imap.provider).toBe("imap_smtp");
    expect(EmailAccount.prototype.save).not.toHaveBeenCalled();
    expect(sentTo("revoke")).toHaveLength(1);
    expect(enqueueAccountSync).not.toHaveBeenCalled();
  });

  it("checks the channel switch again before exchanging the code", async () => {
    (emailEnabledForCompany as jest.Mock).mockResolvedValue(false);
    const { redirectTo } = await connect();
    expect(redirectTo).toBe(
      `${TENANT}/connections?email=error&code=ERR_EMAIL_CHANNEL_DISABLED`
    );
    expect(sent).toHaveLength(0);
  });

  it("maps a refused code exchange to a fixed code without logging secrets", async () => {
    tokenResponse = {
      status: 400,
      body: { error: "invalid_grant", error_description: "Bad Request" }
    };
    const { redirectTo } = await connect();
    expect(redirectTo).toBe(
      `${TENANT}/connections?email=error&code=ERR_GMAIL_OAUTH_FAILED`
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it("never logs or redirects with tokens, codes, state or the client secret", async () => {
    const { state, redirectTo } = await connect();
    tokenResponse.body.scope = READONLY;
    await connect();
    profileResponse = { status: 500, body: {} };
    tokenResponse.body.scope = `${READONLY} ${SEND}`;
    accounts = [];
    await connect();

    const text = loggedText() + redirectTo;
    [REFRESH_TOKEN, ACCESS_TOKEN, AUTH_CODE, CLIENT_SECRET, state].forEach(
      secret => expect(text).not.toContain(secret)
    );
  });
});

describe("getGmailAuthClient", () => {
  it("refreshes with the stored refresh token", async () => {
    const account = makeAccount({}, REFRESH_TOKEN);
    const client = getGmailAuthClient(account);
    const { token } = await client.getAccessToken();
    expect(token).toBe("ya29.refreshed-SECRET");
    const refresh = sentTo("oauth2.googleapis.com/token");
    expect(new URLSearchParams(refresh[0].body).get("refresh_token")).toBe(
      REFRESH_TOKEN
    );
  });

  it("refresh failure with invalid_grant raises EmailAuthError", async () => {
    refreshResponse = {
      status: 400,
      body: {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked."
      }
    };
    const account = makeAccount({}, REFRESH_TOKEN);
    const client = getGmailAuthClient(account);
    await expect(client.getAccessToken()).rejects.toBeInstanceOf(
      EmailAuthError
    );
    await expect(
      client.request({
        url: "https://gmail.googleapis.com/gmail/v1/users/me/profile"
      })
    ).rejects.toBeInstanceOf(EmailAuthError);
    const error = await client.getAccessToken().catch(err => err);
    expect(JSON.stringify(error)).not.toContain("SECRET");
    expect(String(error.message)).not.toContain("SECRET");
  });

  it("other refresh failures are transient, with no server text", async () => {
    refreshResponse = { status: 401, body: { error: "invalid_client" } };
    const client = getGmailAuthClient(makeAccount({}, REFRESH_TOKEN));
    const error = await client.getAccessToken().catch(err => err);
    expect(error).toBeInstanceOf(EmailTransientError);
    expect(error.message).not.toContain("SECRET");
  });

  it("an account without a refresh token needs re-authentication", () => {
    expect(() => getGmailAuthClient(makeAccount({}))).toThrow(EmailAuthError);
  });

  it("exposes a rotated refresh token without writing the account (R23)", async () => {
    refreshResponse.body.refresh_token = "1//rotated-SECRET";
    const account = makeAccount({}, REFRESH_TOKEN);
    const client = getGmailAuthClient(account);
    await client.getAccessToken();
    expect(client.rotatedRefreshToken).toBe("1//rotated-SECRET");
    expect(EmailAccount.prototype.save).not.toHaveBeenCalled();
    expect(account.getCredentials()).toEqual({ refreshToken: REFRESH_TOKEN });

    const update = jest
      .spyOn(EmailAccount, "update")
      .mockResolvedValue([1, [{ updatedAt: new Date() }]] as any);
    await expect(persistRotatedRefreshToken(account, client)).resolves.toBe(
      true
    );
    const [values, options] = update.mock.calls[0] as any;
    expect(values.credentials).not.toContain("rotated");
    expect(options.where).toMatchObject({
      id: account.id,
      provider: "gmail_api",
      updatedAt: new Date("2026-10-19T10:00:00.000Z")
    });
    expect(account.getCredentials()).toEqual({
      refreshToken: "1//rotated-SECRET"
    });
    expect(client.rotatedRefreshToken).toBeNull();
    await expect(persistRotatedRefreshToken(account, client)).resolves.toBe(
      false
    );
  });
});

describe("revocation", () => {
  it("disableEmailAccount revokes a gmail token before wiping the credentials", async () => {
    const account = makeAccount({}, REFRESH_TOKEN);
    await disableEmailAccount(account);
    const revokes = sentTo("oauth2.googleapis.com/revoke");
    expect(revokes).toHaveLength(1);
    expect(new URLSearchParams(revokes[0].body).get("token")).toBe(
      REFRESH_TOKEN
    );
    expect(revokes[0].url).not.toContain("SECRET");
    expect(account.status).toBe("disabled");
    expect(account.getCredentials()).toBeNull();
  });

  it("a failed revocation is only logged, without the token", async () => {
    revokeResponse = { status: 400, body: { error: "invalid_token" } };
    const account = makeAccount({}, REFRESH_TOKEN);
    await expect(disableEmailAccount(account)).resolves.toBeUndefined();
    expect(account.status).toBe("disabled");
    expect(logger.warn).toHaveBeenCalled();
    expect(loggedText()).not.toContain("SECRET");
  });

  it("keeps the Google grant while another company still uses the same mailbox", async () => {
    makeAccount({ companyId: 2 }, "1//other-company");
    const account = makeAccount({ companyId: 1 }, REFRESH_TOKEN);
    await revokeGmailAccount(account);
    expect(sentTo("revoke")).toHaveLength(0);
  });

  it("does nothing for IMAP accounts", async () => {
    const account = makeAccount({ provider: "imap_smtp", preset: "custom" });
    account.setCredentials({ password: "pw" });
    await disableEmailAccount(account);
    expect(sentTo("revoke")).toHaveLength(0);
    expect(account.status).toBe("disabled");
  });
});
