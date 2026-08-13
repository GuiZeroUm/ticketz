import {
  createPkceChallenge,
  hashOAuthToken,
  validateRedirectUri,
  validateScopes
} from "../../services/McpServices/OAuthService";

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
