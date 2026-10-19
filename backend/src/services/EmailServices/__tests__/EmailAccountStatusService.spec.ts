/* eslint-disable @typescript-eslint/no-explicit-any */
jest.mock("../../../models/EmailAccount", () => ({
  __esModule: true,
  default: { update: jest.fn() }
}));
jest.mock("../../../libs/socket", () => ({ getIO: jest.fn() }));
jest.mock("../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import EmailAccount from "../../../models/EmailAccount";
import { getIO } from "../../../libs/socket";
import { EmailAuthError, EmailTransientError } from "../adapters/errors";
import { markAccountError } from "../EmailAccountStatusService";

const account = (over: any = {}): any => {
  const row: any = {
    id: 3,
    companyId: 7,
    status: "active",
    errorCount: 0,
    lastError: null,
    updatedAt: new Date("2026-10-19T10:00:00Z"),
    ...over
  };
  row.set = jest.fn((values: any) => Object.assign(row, values));
  return row;
};

describe("markAccountError", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (EmailAccount.update as jest.Mock).mockResolvedValue([
      1,
      [{ updatedAt: new Date() }]
    ]);
    const room = { emit: jest.fn() };
    (getIO as jest.Mock).mockReturnValue({ to: () => room });
  });

  it("puts the account in error right away when ENCRYPTION_KEY is missing", async () => {
    const row = account();
    await markAccountError(
      row,
      new EmailTransientError("ERR_EMAIL_ENCRYPTION_NOT_CONFIGURED")
    );
    const [changes] = (EmailAccount.update as jest.Mock).mock.calls[0];
    expect(changes).toMatchObject({
      status: "error",
      lastError: { code: "ERR_EMAIL_ENCRYPTION_NOT_CONFIGURED" }
    });
    expect(changes.status).not.toBe("reauth_required");
  });

  it("keeps the threshold for ordinary transient errors", async () => {
    await markAccountError(account(), new EmailTransientError());
    const [changes] = (EmailAccount.update as jest.Mock).mock.calls[0];
    expect(changes).toMatchObject({
      errorCount: 1,
      lastError: { code: "ERR_EMAIL_TRANSIENT" }
    });
    expect(changes).not.toHaveProperty("status");
  });

  it("still asks for re-authentication on an auth error", async () => {
    await markAccountError(account(), new EmailAuthError());
    const [changes] = (EmailAccount.update as jest.Mock).mock.calls[0];
    expect(changes.status).toBe("reauth_required");
  });
});
