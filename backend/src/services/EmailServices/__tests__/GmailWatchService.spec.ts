/* eslint-disable @typescript-eslint/no-explicit-any */
import { Op } from "sequelize";
import { gmail } from "@googleapis/gmail";
import EmailAccount from "../../../models/EmailAccount";
import { logger } from "../../../utils/logger";
import { emailEnabledForCompany } from "../EmailAccessService";
import {
  getGmailAuthClient,
  gmailGrantInUse,
  persistRotatedRefreshToken
} from "../GmailAuthClient";
import {
  WATCH_RENEW_WINDOW_MS,
  renewExpiringWatches,
  stopGmailWatch,
  watchGmailAccount
} from "../GmailWatchService";

jest.mock("../../../utils/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
}));
jest.mock("@googleapis/gmail", () => ({ gmail: jest.fn() }));
jest.mock("../GmailAuthClient", () => ({
  GMAIL_HTTP_TIMEOUT_MS: 15000,
  getGmailAuthClient: jest.fn(),
  gmailGrantInUse: jest.fn(),
  persistRotatedRefreshToken: jest.fn(),
  gmailFailureReason: (err: any) =>
    typeof err?.response?.status === "number"
      ? `HTTP_${err.response.status}`
      : "UNKNOWN"
}));
jest.mock("../EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn()
}));
jest.mock("../../../models/EmailAccount", () => {
  const findAll = jest.fn();
  return {
    __esModule: true,
    default: {
      update: jest.fn(),
      scope: jest.fn(() => ({ findAll })),
      findAllMock: findAll
    }
  };
});

const TOPIC = "projects/espaco/topics/gmail-push";
const NOW = new Date("2026-10-19T12:00:00.000Z").getTime();
const HOUR = 60 * 60 * 1000;
const SECRET = "1//refresh-token-SECRET";

const Model = EmailAccount as any;
const watch = jest.fn();
const stop = jest.fn();
let client: { rotatedRefreshToken: string | null };

const account = (over: Record<string, any> = {}) => {
  const row: any = {
    id: 1,
    companyId: 1,
    provider: "gmail_api",
    status: "active",
    address: "caixa@gmail.com",
    watchExpiresAt: null,
    getCredentials: () => ({ refreshToken: SECRET }),
    setDataValue: jest.fn((key: string, value: unknown) => {
      row[key] = value;
    }),
    ...over
  };
  return row;
};

const loggedText = () =>
  JSON.stringify(
    ["info", "warn", "error"].flatMap(
      level => (logger as any)[level].mock.calls
    )
  );

const httpError = (status: number) =>
  Object.assign(new Error("Request failed"), {
    name: "GaxiosError",
    response: { status, data: { error: "invalid_grant" } },
    config: { headers: { Authorization: `Bearer ${SECRET}` } }
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  process.env.GMAIL_PUBSUB_TOPIC = TOPIC;
  delete process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS;
  delete process.env.TENANT_RUNTIME_COMPANY_ID;
  client = { rotatedRefreshToken: null };
  (getGmailAuthClient as jest.Mock).mockImplementation(() => client);
  (gmail as jest.Mock).mockReturnValue({ users: { watch, stop } });
  watch.mockResolvedValue({
    data: { historyId: "123", expiration: String(NOW + 7 * 24 * HOUR) }
  });
  stop.mockResolvedValue({ data: "" });
  Model.update.mockResolvedValue([1]);
  (gmailGrantInUse as jest.Mock).mockResolvedValue(false);
  (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore();
  delete process.env.GMAIL_PUBSUB_TOPIC;
});

describe("watchGmailAccount", () => {
  it("watches INBOX and SENT on the configured topic and records the expiry with a guarded, silent write", async () => {
    const row = account();
    await expect(watchGmailAccount(row)).resolves.toBe(true);

    expect(getGmailAuthClient).toHaveBeenCalledWith(row);
    expect(gmail).toHaveBeenCalledWith({ version: "v1", auth: client });
    expect(watch).toHaveBeenCalledWith(
      {
        userId: "me",
        requestBody: {
          topicName: TOPIC,
          labelIds: ["INBOX", "SENT"],
          labelFilterBehavior: "include"
        }
      },
      expect.objectContaining({ retry: false })
    );
    const expiresAt = new Date(NOW + 7 * 24 * HOUR);
    expect(Model.update).toHaveBeenCalledWith(
      { watchExpiresAt: expiresAt },
      {
        where: { id: 1, provider: "gmail_api", status: "active" },
        silent: true
      }
    );
    expect(row.watchExpiresAt).toEqual(expiresAt);
  });

  it("does nothing when GMAIL_PUBSUB_TOPIC is not set", async () => {
    delete process.env.GMAIL_PUBSUB_TOPIC;
    await expect(watchGmailAccount(account())).resolves.toBe(false);
    expect(getGmailAuthClient).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
    expect(Model.update).not.toHaveBeenCalled();
  });

  it("ignores IMAP accounts", async () => {
    await watchGmailAccount(account({ provider: "imap_smtp" }));
    expect(watch).not.toHaveBeenCalled();
  });

  it("a failed watch (invalid_grant/401) never throws, writes nothing and logs only a reason", async () => {
    watch.mockRejectedValue(httpError(401));
    const row = account();
    await expect(watchGmailAccount(row)).resolves.toBe(false);
    expect(Model.update).not.toHaveBeenCalled();
    expect(row.status).toBe("active");
    expect(logger.warn).toHaveBeenCalledWith(
      { companyId: 1, emailAccountId: 1, reason: "HTTP_401" },
      "Could not start Gmail watch"
    );
    expect(loggedText()).not.toContain("SECRET");
  });

  it("an account without credentials is skipped without throwing", async () => {
    (getGmailAuthClient as jest.Mock).mockImplementation(() => {
      throw Object.assign(new Error("ERR_EMAIL_CREDENTIALS_MISSING"), {
        name: "EmailAuthError"
      });
    });
    await expect(watchGmailAccount(account())).resolves.toBe(false);
    expect(watch).not.toHaveBeenCalled();
  });

  it("does not record the expiry of an account disabled or sent to reauth meanwhile", async () => {
    Model.update.mockResolvedValue([0]);
    const row = account();
    await expect(watchGmailAccount(row)).resolves.toBe(false);
    expect(row.setDataValue).not.toHaveBeenCalled();
  });

  it("an answer without a valid expiration writes nothing", async () => {
    watch.mockResolvedValue({ data: { historyId: "1", expiration: "soon" } });
    await expect(watchGmailAccount(account())).resolves.toBe(false);
    expect(Model.update).not.toHaveBeenCalled();
  });

  it("persists a refresh token rotated during the call through the guarded helper", async () => {
    watch.mockImplementation(async () => {
      client.rotatedRefreshToken = "1//rotated";
      return { data: { expiration: String(NOW + HOUR) } };
    });
    const row = account();
    await watchGmailAccount(row);
    expect(persistRotatedRefreshToken).toHaveBeenCalledWith(row, client);
  });
});

describe("stopGmailWatch", () => {
  const live = () => account({ watchExpiresAt: new Date(NOW + 24 * HOUR) });

  it("stops a running watch", async () => {
    const row = live();
    await stopGmailWatch(row);
    expect(gmailGrantInUse).toHaveBeenCalledWith("caixa@gmail.com", 1);
    expect(stop).toHaveBeenCalledWith(
      { userId: "me" },
      expect.objectContaining({ retry: false })
    );
  });

  it("keeps the watch while another account still uses the mailbox", async () => {
    (gmailGrantInUse as jest.Mock).mockResolvedValue(true);
    await stopGmailWatch(live());
    expect(stop).not.toHaveBeenCalled();
  });

  it("does nothing without a running watch or for IMAP accounts", async () => {
    await stopGmailWatch(account());
    await stopGmailWatch(account({ watchExpiresAt: new Date(NOW - HOUR) }));
    await stopGmailWatch(
      account({
        provider: "imap_smtp",
        watchExpiresAt: new Date(NOW + HOUR)
      })
    );
    expect(stop).not.toHaveBeenCalled();
    expect(gmailGrantInUse).not.toHaveBeenCalled();
  });

  it("a failed stop is only logged, without secrets", async () => {
    stop.mockRejectedValue(httpError(500));
    await expect(stopGmailWatch(live())).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      { companyId: 1, emailAccountId: 1, reason: "HTTP_500" },
      "Could not stop Gmail watch"
    );
    expect(loggedText()).not.toContain("SECRET");
  });
});

describe("renewExpiringWatches", () => {
  // Emulates the database side of the query: status/provider equality and
  // the watchExpiresAt window, so the test checks what the where selects.
  const fixtures: any[] = [];
  const findAll = () => Model.findAllMock as jest.Mock;

  const inWindow = (row: any, where: any) => {
    const [base, window] = where[Op.and];
    const limit = window[Op.or][1].watchExpiresAt[Op.lt];
    return (
      Object.entries(base).every(([k, v]) => row[k] === v) &&
      (row.watchExpiresAt === null || row.watchExpiresAt < limit)
    );
  };

  beforeEach(() => {
    fixtures.length = 0;
    findAll().mockImplementation(async ({ where }: any) =>
      fixtures.filter(row => inWindow(row, where))
    );
  });

  it("renews only active gmail accounts whose watch is unknown or ends within 48h", async () => {
    fixtures.push(
      account({ id: 1, watchExpiresAt: new Date(NOW + 47 * HOUR) }),
      account({ id: 2, watchExpiresAt: null }),
      account({ id: 3, watchExpiresAt: new Date(NOW + 72 * HOUR) }),
      account({ id: 4, watchExpiresAt: new Date(NOW - HOUR) })
    );

    await expect(renewExpiringWatches()).resolves.toBe(3);

    expect(Model.scope).toHaveBeenCalledWith("withSecrets");
    const { where } = findAll().mock.calls[0][0];
    expect(where[Op.and][0]).toEqual({
      provider: "gmail_api",
      status: "active"
    });
    expect(where[Op.and][1][Op.or][1].watchExpiresAt[Op.lt]).toEqual(
      new Date(NOW + WATCH_RENEW_WINDOW_MS)
    );
    const renewed = Model.update.mock.calls.map((c: any[]) => c[1].where.id);
    expect(renewed).toEqual([1, 2, 4]);
  });

  it("never touches disabled or reauth accounts", async () => {
    fixtures.push(
      account({ id: 5, status: "disabled" }),
      account({ id: 6, status: "reauth_required" }),
      account({ id: 7, status: "error" })
    );
    await expect(renewExpiringWatches()).resolves.toBe(0);
    expect(watch).not.toHaveBeenCalled();
    expect(Model.update).not.toHaveBeenCalled();
  });

  it("skips companies with the channel disabled or not owned by this runtime", async () => {
    process.env.TENANT_RUNTIME_EXCLUDED_COMPANY_IDS = "3";
    fixtures.push(
      account({ id: 1, companyId: 1 }),
      account({ id: 2, companyId: 2 }),
      account({ id: 3, companyId: 3 })
    );
    (emailEnabledForCompany as jest.Mock).mockImplementation(
      async (companyId: number) => companyId !== 2
    );

    await expect(renewExpiringWatches()).resolves.toBe(1);
    const { where } = findAll().mock.calls[0][0];
    expect(where[Op.and][2]).toEqual({ companyId: { [Op.notIn]: [3] } });
    expect(Model.update.mock.calls.map((c: any[]) => c[1].where.id)).toEqual([
      1
    ]);
  });

  it("does nothing when GMAIL_PUBSUB_TOPIC is not set", async () => {
    delete process.env.GMAIL_PUBSUB_TOPIC;
    fixtures.push(account());
    await expect(renewExpiringWatches()).resolves.toBe(0);
    expect(findAll()).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
  });

  it("one failing account does not stop the others", async () => {
    fixtures.push(account({ id: 1 }), account({ id: 2 }));
    watch.mockRejectedValueOnce(httpError(500));
    await expect(renewExpiringWatches()).resolves.toBe(1);
    expect(watch).toHaveBeenCalledTimes(2);
  });
});
