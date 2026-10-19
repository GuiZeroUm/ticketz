process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key";

// Importar o índice registra todos os models (inclusive associações) sem abrir conexão.

import "../../database";

import EmailAccount from "../../models/EmailAccount";

import Ticket from "../../models/Ticket";

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

describe("EmailAccount secrets in scopes and nested models", () => {
  const capturedSql = async (run: () => Promise<unknown>) => {
    const spy = jest
      .spyOn(Ticket.sequelize!, "query")
      .mockResolvedValue([] as never);
    try {
      await run();
      return spy.mock.calls.map(call => String(call[0])).join("\n");
    } finally {
      spy.mockRestore();
    }
  };

  const buildWithSecrets = () => {
    const account = EmailAccount.build({
      id: 7,
      companyId: 1,
      provider: "imap_smtp",
      preset: "custom",
      name: "Contato",
      address: "c@x.com"
    });
    account.setCredentials({ password: "s3cret" });
    account.syncCursor = { INBOX: { uidValidity: 1, lastUid: 10 } };
    return account;
  };

  it("default scope selects neither credentials nor syncCursor", async () => {
    const sql = await capturedSql(() => EmailAccount.findAll());
    expect(sql).toContain("address");
    expect(sql).not.toMatch(/credentials|syncCursor/);
  });

  it("default scope is applied to an included emailAccount", async () => {
    const sql = await capturedSql(() =>
      Ticket.findAll({ include: [{ model: EmailAccount, as: "emailAccount" }] })
    );
    expect(sql).toContain("emailAccount");
    expect(sql).not.toMatch(/credentials|syncCursor/);
  });

  it("withSecrets scope selects all attributes", async () => {
    const sql = await capturedSql(() =>
      EmailAccount.scope("withSecrets").findAll()
    );
    expect(sql).toMatch(/credentials/);
    expect(sql).toMatch(/syncCursor/);
  });

  it("a Ticket with a nested EmailAccount never serializes the secrets", () => {
    const ticket = Ticket.build(
      {
        id: 1,
        companyId: 1,
        emailAccountId: 7,
        emailAccount: buildWithSecrets()
      },
      { include: [{ model: EmailAccount, as: "emailAccount" }] }
    );
    expect(ticket.emailAccount).toBeInstanceOf(EmailAccount);
    const json = JSON.stringify(ticket);
    expect(json).toContain("c@x.com");
    expect(json).not.toMatch(/credentials|syncCursor|s3cret|lastUid/);
  });

  it("get({ plain: true }) strips the secrets but get(key) still reads them", () => {
    const account = buildWithSecrets();
    expect(account.get({ plain: true })).not.toHaveProperty("credentials");
    expect(account.get({ plain: true })).not.toHaveProperty("syncCursor");
    expect(account.get("syncCursor")).toBeTruthy();
    expect(account.getCredentials()).toEqual({ password: "s3cret" });
  });

  it("getCredentials works on an instance loaded with withSecrets", () => {
    const loaded = buildWithSecrets();
    const raw = loaded.getDataValue("credentials") as string;
    const reloaded = EmailAccount.scope("withSecrets").build(
      { id: 7, companyId: 1, credentials: raw },
      { isNewRecord: false, raw: true }
    );
    expect(reloaded.getCredentials()).toEqual({ password: "s3cret" });
    const withoutSecrets = EmailAccount.build(
      { id: 7, companyId: 1 },
      { isNewRecord: false, raw: true }
    );
    expect(withoutSecrets.getCredentials()).toBeNull();
  });
});
