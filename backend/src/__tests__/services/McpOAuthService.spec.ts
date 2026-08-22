import sequelize from "../../database";
import mcpConfig from "../../config/mcp";
import OAuthRefreshToken from "../../models/OAuthRefreshToken";
import {
  DEFAULT_GRANT_SCOPES,
  createPkceChallenge,
  hashOAuthToken,
  rotateRefreshToken,
  validateRedirectUri,
  validateScopes
} from "../../services/McpServices/OAuthService";

describe("MCP OAuth refresh rotation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("locks only the refresh token row, never the joined tables", async () => {
    // Um lock sem "of" viraria "FOR UPDATE" sobre o LEFT OUTER JOIN gerado pelo
    // include, e o Postgres recusa isso: toda renovação de token falhava.
    const transactionSpy = jest.spyOn(
      sequelize,
      "transaction"
    ) as unknown as jest.SpyInstance;
    transactionSpy.mockImplementation(
      (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({ LOCK: { UPDATE: "UPDATE" } })
    );
    const findOne = jest
      .spyOn(OAuthRefreshToken, "findOne")
      .mockResolvedValue(null);

    // AppError não estende Error, então a asserção é sobre o objeto rejeitado.
    await expect(
      rotateRefreshToken({
        refreshToken: "unknown-refresh-token",
        clientId: "ticketz_test",
        resource: mcpConfig.resource
      })
    ).rejects.toMatchObject({ message: "invalid_grant" });

    const options = findOne.mock.calls[0][0] as {
      include?: unknown[];
      lock?: unknown;
    };
    expect(options.include).toHaveLength(1);
    expect(options.lock).toEqual({
      level: "UPDATE",
      of: OAuthRefreshToken
    });
  });
});

describe("MCP OAuth security primitives", () => {
  it("creates the RFC 7636 S256 challenge", () => {
    expect(
      createPkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("accepts only supported scopes", () => {
    expect(validateScopes("reports:read conversations:read")).toEqual([
      "reports:read",
      "conversations:read"
    ]);
    expect(() => validateScopes("conversations:write")).toThrow(
      "invalid_scope"
    );
  });

  it("grants only reads when the client omits the scope parameter", () => {
    // Antes o padrão era todo o mcpConfig.scopes: quem não pedia escrita saía
    // do consentimento podendo gravar. Escrita agora exige pedido explícito.
    const granted = validateScopes();

    expect(granted).toEqual(DEFAULT_GRANT_SCOPES);
    expect(granted).toEqual(expect.arrayContaining(["conversations:read"]));
    expect(granted.some(scope => scope.endsWith(":write"))).toBe(false);
    expect(validateScopes("")).toEqual(granted);
  });

  it("grants the write scopes the client asks for explicitly", () => {
    expect(validateScopes("conversations:read schedules:write")).toEqual([
      "conversations:read",
      "schedules:write"
    ]);
    expect(validateScopes("quick_messages:write")).toEqual([
      "quick_messages:write"
    ]);
  });

  it("rejects a scope that does not exist", () => {
    expect(() => validateScopes("schedules:delete")).toThrow("invalid_scope");
    expect(() => validateScopes("conversations:read schedules:admin")).toThrow(
      "invalid_scope"
    );
  });

  it("accepts the current ChatGPT callback and rejects arbitrary redirects", () => {
    expect(() =>
      validateRedirectUri("https://chatgpt.com/connector/oauth/test_callback-1")
    ).not.toThrow();
    expect(() =>
      validateRedirectUri("https://attacker.example/oauth/callback")
    ).toThrow("invalid_redirect_uri");
  });

  it("hashes opaque tokens without storing their raw value", () => {
    const raw = "secret-refresh-token";
    const hash = hashOAuthToken(raw);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(raw);
  });
});
