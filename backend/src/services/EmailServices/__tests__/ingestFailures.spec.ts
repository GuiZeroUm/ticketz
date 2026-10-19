/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ConnectionRefusedError,
  TimeoutError,
  ValidationError
} from "sequelize";
import {
  INGEST_FAILURES_TTL_SECONDS,
  clearIngestFailure,
  ingestFailuresKey,
  isInfrastructureError,
  recordIngestFailure
} from "../ingestFailures";

jest.mock("ioredis", () => ({ __esModule: true, default: jest.fn() }));

describe("ingest failure counters", () => {
  it("counts per account hash field and refreshes the TTL", async () => {
    const client = {
      hincrby: jest.fn().mockResolvedValue(2),
      expire: jest.fn().mockResolvedValue(1),
      hdel: jest.fn().mockResolvedValue(1)
    };
    await expect(
      recordIngestFailure(7, "INBOX:1:5", client as any)
    ).resolves.toBe(2);
    expect(client.hincrby).toHaveBeenCalledWith(
      "email:ingest-failures:7",
      "INBOX:1:5",
      1
    );
    expect(client.expire).toHaveBeenCalledWith(
      ingestFailuresKey(7),
      INGEST_FAILURES_TTL_SECONDS
    );
    expect(INGEST_FAILURES_TTL_SECONDS).toBe(7 * 24 * 60 * 60);
    await clearIngestFailure(7, "INBOX:1:5", client as any);
    expect(client.hdel).toHaveBeenCalledWith(
      "email:ingest-failures:7",
      "INBOX:1:5"
    );
  });

  it("classifies infrastructure errors", () => {
    expect(
      isInfrastructureError(new ConnectionRefusedError(new Error("x")))
    ).toBe(true);
    expect(isInfrastructureError(new TimeoutError(new Error("x") as any))).toBe(
      true
    );
    expect(
      isInfrastructureError(Object.assign(new Error(), { name: "ReplyError" }))
    ).toBe(true);
    expect(
      isInfrastructureError(Object.assign(new Error(), { code: "ETIMEDOUT" }))
    ).toBe(true);
    expect(isInfrastructureError(new ValidationError("bad", []))).toBe(false);
    expect(isInfrastructureError(new Error("boom"))).toBe(false);
    expect(isInfrastructureError(undefined)).toBe(false);
  });
});
