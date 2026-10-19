process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key";

// Importar o índice registra todos os models (inclusive associações) sem abrir conexão.

import "../../database";

import EmailAccount from "../../models/EmailAccount";

import serializeEmailAccount from "../../helpers/SerializeEmailAccount";

describe("EmailAccount serialization", () => {
  const build = () =>
    EmailAccount.build({
      companyId: 1,
      provider: "imap_smtp",
      preset: "custom",
      name: "Contato",
      address: "c@x.com"
    });

  it("never serializes credentials or syncCursor", () => {
    const a = build();
    a.setCredentials({ password: "s3cret" });
    a.syncCursor = { INBOX: { uidValidity: 1, lastUid: 10 } };
    expect(JSON.stringify(a)).not.toContain("s3cret");
    expect(JSON.stringify(a)).not.toMatch(/credentials|syncCursor/);
    expect(JSON.stringify(serializeEmailAccount(a))).not.toMatch(
      /credentials|s3cret|syncCursor/
    );
    expect(a.getCredentials()).toEqual({ password: "s3cret" });
  });

  it("stores credentials encrypted, not as plain JSON", () => {
    const a = build();
    a.setCredentials({ refreshToken: "tok-123" });
    const raw = a.getDataValue("credentials") as string;
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("tok-123");
  });

  it("clears credentials with null", () => {
    const a = build();
    a.setCredentials({ password: "x" });
    a.setCredentials(null);
    expect(a.getCredentials()).toBeNull();
  });

  it("serializes only the public fields", () => {
    const a = build();
    expect(Object.keys(serializeEmailAccount(a)).sort()).toEqual(
      [
        "id",
        "provider",
        "preset",
        "name",
        "address",
        "status",
        "queueId",
        "lastSyncAt",
        "lastError",
        "imapHost",
        "imapPort",
        "smtpHost",
        "smtpPort",
        "updatedAt"
      ].sort()
    );
  });
});
