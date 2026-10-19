/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ConnectionRefusedError,
  DatabaseError,
  ForeignKeyConstraintError,
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
  it.each(["ENOSPC", "EDQUOT", "EMFILE", "ENFILE", "EACCES", "EIO"])(
    "treats the storage/system error %s as infrastructure",
    code => {
      expect(
        isInfrastructureError(Object.assign(new Error("fs"), { code }))
      ).toBe(true);
    }
  );

  const dbError = (code: string) =>
    new DatabaseError(Object.assign(new Error("pg"), { code, sql: "" }) as any);

  it.each([
    "08006", // connection failure
    "08P01", // protocol violation
    "53100", // disk full
    "53300", // too many connections
    "57P01", // admin shutdown
    "40001", // serialization failure
    "40P01" // deadlock detected
  ])("treats SQLSTATE %s as infrastructure", code => {
    expect(isInfrastructureError(dbError(code))).toBe(true);
    // raw driver error, not wrapped by Sequelize
    expect(
      isInfrastructureError(Object.assign(new Error("pg"), { code }))
    ).toBe(true);
  });

  // A statement that always times out on one message is that message's
  // problem: it must still reach the poison skip.
  it("keeps counting a statement timeout (SQLSTATE 57014)", () => {
    expect(isInfrastructureError(dbError("57014"))).toBe(false);
    expect(
      isInfrastructureError(Object.assign(new Error("pg"), { code: "57014" }))
    ).toBe(false);
  });

  it.each(["22001", "22P02", "23502", "42703", "40002"])(
    "keeps counting data errors such as SQLSTATE %s",
    code => {
      expect(isInfrastructureError(dbError(code))).toBe(false);
    }
  );

  it("keeps counting constraint violations", () => {
    const fk = new ForeignKeyConstraintError({
      parent: Object.assign(new Error("fk"), { code: "23503", sql: "" }) as any
    });
    expect(isInfrastructureError(fk)).toBe(false);
  });
});
