import dns from "dns";
import { resolveSafeMailEndpoint } from "../mailEndpoint";
import { EMAIL_PRESETS } from "../presets";

const mockLookup = (addresses: string[]) =>
  jest.spyOn(dns.promises, "lookup").mockResolvedValue(
    addresses.map(address => ({
      address,
      family: address.includes(":") ? 6 : 4
    })) as never
  );

const expectCode = async (promise: Promise<unknown>, message: string) => {
  await expect(promise).rejects.toMatchObject({ message, statusCode: 400 });
};

describe("resolveSafeMailEndpoint", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("rejects localhost, IP literals and a name resolving to 10.0.0.5", async () => {
    const lookup = mockLookup(["127.0.0.1"]);
    await expectCode(
      resolveSafeMailEndpoint({ host: "localhost", port: 993, kind: "imap" }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
    await expectCode(
      resolveSafeMailEndpoint({ host: "127.0.0.1", port: 993, kind: "imap" }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
    await expectCode(
      resolveSafeMailEndpoint({ host: "[::1]", port: 993, kind: "imap" }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
    await expectCode(
      resolveSafeMailEndpoint({ host: "::1", port: 993, kind: "imap" }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
    expect(lookup).not.toHaveBeenCalled();

    mockLookup(["10.0.0.5"]);
    await expectCode(
      resolveSafeMailEndpoint({
        host: "mail.evil.test",
        port: 993,
        kind: "imap"
      }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
  });

  it("rejects a name where one of several A records is private", async () => {
    mockLookup(["93.184.216.34", "192.168.1.10"]);
    await expectCode(
      resolveSafeMailEndpoint({
        host: "mail.evil.test",
        port: 587,
        kind: "smtp"
      }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
  });

  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "100.64.0.1",
    "100.127.255.255",
    "224.0.0.1",
    "239.255.255.255",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "febf::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:0.0.0.0",
    "::ffff:169.254.169.254",
    "::ffff:93.184.216.34",
    "64:ff9b::a00:1",
    "2002:a00:1::1",
    "240.0.0.1",
    "198.18.0.1"
  ])("blocks %s", async address => {
    mockLookup([address]);
    await expectCode(
      resolveSafeMailEndpoint({
        host: "mail.example.com",
        port: 993,
        kind: "imap"
      }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
  });

  it.each([
    "172.15.255.255",
    "172.32.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "11.0.0.1",
    "192.169.0.1",
    "169.253.0.1",
    "2001:4860:4860::8888"
  ])("allows public address %s", async address => {
    mockLookup([address]);
    await expect(
      resolveSafeMailEndpoint({
        host: "mail.example.com",
        port: 993,
        kind: "imap"
      })
    ).resolves.toMatchObject({ address });
  });

  it("rejects hosts without a dot and empty hosts", async () => {
    const lookup = mockLookup(["93.184.216.34"]);
    await expectCode(
      resolveSafeMailEndpoint({ host: "intranet", port: 993, kind: "imap" }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
    await expectCode(
      resolveSafeMailEndpoint({ host: "", port: 993, kind: "imap" }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects when DNS fails or returns nothing", async () => {
    jest
      .spyOn(dns.promises, "lookup")
      .mockRejectedValue(new Error("ENOTFOUND"));
    await expectCode(
      resolveSafeMailEndpoint({
        host: "nx.example.com",
        port: 993,
        kind: "imap"
      }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
    jest.restoreAllMocks();
    mockLookup([]);
    await expectCode(
      resolveSafeMailEndpoint({
        host: "nx.example.com",
        port: 993,
        kind: "imap"
      }),
      "ERR_EMAIL_HOST_NOT_ALLOWED"
    );
  });

  it("rejects port 25 for smtp and 110 for imap", async () => {
    mockLookup(["93.184.216.34"]);
    await expectCode(
      resolveSafeMailEndpoint({
        host: "smtp.example.com",
        port: 25,
        kind: "smtp"
      }),
      "ERR_EMAIL_PORT_NOT_ALLOWED"
    );
    await expectCode(
      resolveSafeMailEndpoint({
        host: "imap.example.com",
        port: 110,
        kind: "imap"
      }),
      "ERR_EMAIL_PORT_NOT_ALLOWED"
    );
    await expectCode(
      resolveSafeMailEndpoint({
        host: "imap.example.com",
        port: 587,
        kind: "imap"
      }),
      "ERR_EMAIL_PORT_NOT_ALLOWED"
    );
    await expectCode(
      resolveSafeMailEndpoint({
        host: "smtp.example.com",
        port: 993,
        kind: "smtp"
      }),
      "ERR_EMAIL_PORT_NOT_ALLOWED"
    );
  });

  it("accepts the allowed ports for each kind", async () => {
    mockLookup(["93.184.216.34"]);
    await Promise.all(
      [993, 143].map(async port => {
        await expect(
          resolveSafeMailEndpoint({
            host: "imap.example.com",
            port,
            kind: "imap"
          })
        ).resolves.toMatchObject({ port });
      })
    );
    await Promise.all(
      [465, 587].map(async port => {
        await expect(
          resolveSafeMailEndpoint({
            host: "smtp.example.com",
            port,
            kind: "smtp"
          })
        ).resolves.toMatchObject({ port });
      })
    );
  });

  it("returns the resolved public IP plus servername for imap.mail.me.com:993", async () => {
    const lookup = mockLookup(["17.57.155.10", "17.57.155.11"]);
    const result = await resolveSafeMailEndpoint({
      host: "imap.mail.me.com",
      port: 993,
      kind: "imap"
    });
    expect(lookup).toHaveBeenCalledWith("imap.mail.me.com", { all: true });
    expect(result).toEqual({
      address: "17.57.155.10",
      servername: "imap.mail.me.com",
      port: 993
    });
  });

  it("normalizes case and a trailing dot in the servername", async () => {
    mockLookup(["93.184.216.34"]);
    const result = await resolveSafeMailEndpoint({
      host: " IMAP.Example.COM. ",
      port: 993,
      kind: "imap"
    });
    expect(result.servername).toBe("imap.example.com");
  });

  describe("EMAIL_ALLOW_PRIVATE_HOSTS", () => {
    it("allows private hosts and localhost outside production", async () => {
      process.env.NODE_ENV = "test";
      process.env.EMAIL_ALLOW_PRIVATE_HOSTS = "true";
      mockLookup(["127.0.0.1"]);
      await expect(
        resolveSafeMailEndpoint({ host: "localhost", port: 143, kind: "imap" })
      ).resolves.toEqual({
        address: "127.0.0.1",
        servername: "localhost",
        port: 143
      });
      mockLookup(["10.0.0.5"]);
      await expect(
        resolveSafeMailEndpoint({
          host: "greenmail.lan",
          port: 143,
          kind: "imap"
        })
      ).resolves.toMatchObject({ address: "10.0.0.5" });
    });

    it("still enforces the port list", async () => {
      process.env.NODE_ENV = "test";
      process.env.EMAIL_ALLOW_PRIVATE_HOSTS = "true";
      mockLookup(["127.0.0.1"]);
      await expectCode(
        resolveSafeMailEndpoint({ host: "localhost", port: 25, kind: "smtp" }),
        "ERR_EMAIL_PORT_NOT_ALLOWED"
      );
    });

    it("ignores EMAIL_ALLOW_PRIVATE_HOSTS in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.EMAIL_ALLOW_PRIVATE_HOSTS = "true";
      mockLookup(["10.0.0.5"]);
      await expectCode(
        resolveSafeMailEndpoint({
          host: "greenmail.lan",
          port: 143,
          kind: "imap"
        }),
        "ERR_EMAIL_HOST_NOT_ALLOWED"
      );
    });

    it("is off unless exactly 'true'", async () => {
      process.env.NODE_ENV = "test";
      process.env.EMAIL_ALLOW_PRIVATE_HOSTS = "1";
      mockLookup(["10.0.0.5"]);
      await expectCode(
        resolveSafeMailEndpoint({
          host: "greenmail.lan",
          port: 143,
          kind: "imap"
        }),
        "ERR_EMAIL_HOST_NOT_ALLOWED"
      );
    });
  });
});

describe("EMAIL_PRESETS", () => {
  it("defines the icloud preset", () => {
    expect(EMAIL_PRESETS.icloud).toEqual({
      imap: { host: "imap.mail.me.com", port: 993, secure: true },
      smtp: { host: "smtp.mail.me.com", port: 587, secure: false }
    });
  });
});
