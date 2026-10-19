jest.mock("../../../models/EmailAccount", () => ({
  __esModule: true,
  default: { findAll: jest.fn() }
}));
jest.mock("../../../queues/email", () => ({
  enqueueAccountSync: jest.fn(),
  markSyncDirtyIfActive: jest.fn()
}));
jest.mock("../EmailAccessService", () => ({
  emailEnabledForCompany: jest.fn()
}));
jest.mock("../../../helpers/tenantRuntime", () => ({
  runtimeCompanyWhere: jest.fn(() => ({})),
  runtimeOwnsCompany: jest.fn(() => true)
}));
jest.mock("../../../utils/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import EmailAccount from "../../../models/EmailAccount";
import {
  enqueueAccountSync,
  markSyncDirtyIfActive
} from "../../../queues/email";
import { emailEnabledForCompany } from "../EmailAccessService";
import { dispatchGmailPush } from "../GmailPushService";

const enqueue = enqueueAccountSync as jest.Mock;
const markDirty = markSyncDirtyIfActive as jest.Mock;

describe("dispatchGmailPush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (EmailAccount.findAll as jest.Mock).mockResolvedValue([
      { id: 1, companyId: 10 },
      { id: 2, companyId: 20 }
    ]);
    (emailEnabledForCompany as jest.Mock).mockResolvedValue(true);
    enqueue.mockResolvedValue(undefined);
    markDirty.mockResolvedValue(undefined);
  });

  it("flags a running round dirty after enqueueing, like IMAP IDLE", async () => {
    await expect(dispatchGmailPush("caixa@gmail.com")).resolves.toBe(2);

    expect(markDirty.mock.calls).toEqual([[1], [2]]);
    expect(enqueue.mock.invocationCallOrder[0]).toBeLessThan(
      markDirty.mock.invocationCallOrder[0]
    );
  });

  it("still counts the enqueue when the dirty flag cannot be written", async () => {
    markDirty.mockRejectedValueOnce(new Error("redis down"));

    await expect(dispatchGmailPush("caixa@gmail.com")).resolves.toBe(2);
    expect(markDirty).toHaveBeenCalledTimes(2);
  });

  it("does not flag an account whose enqueue failed", async () => {
    enqueue.mockRejectedValueOnce(new Error("redis down"));

    await expect(dispatchGmailPush("caixa@gmail.com")).resolves.toBe(1);
    expect(markDirty.mock.calls).toEqual([[2]]);
  });
});
