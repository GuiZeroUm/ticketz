import {
  renderAuthorizationPage,
  renderExpiredAuthorizationPage
} from "../../views/OAuthAuthorizationView";

const request = {
  clientId: "ticketz_client",
  redirectUri: "https://chatgpt.com/connector/oauth/example",
  state: "state",
  codeChallenge: "a".repeat(43),
  resource: "https://example.com/backend",
  scopes: ["conversations:read", "reports:read"]
};

describe("OAuth authorization pages", () => {
  it("renders one field at a time with absolute backend actions", () => {
    const emailPage = renderAuthorizationPage({
      nonce: "nonce",
      issuer: "https://example.com/backend",
      handle: "handle",
      request,
      step: "email"
    });
    expect(emailPage).toContain(
      'action="https://example.com/backend/oauth/authorize/email"'
    );
    expect(emailPage).toContain('type="email"');
    expect(emailPage).not.toContain('name="password"');
    expect(emailPage.toLowerCase()).not.toContain("tenant");
  });

  it("preserves the email without ever rendering a password value", () => {
    const passwordPage = renderAuthorizationPage({
      nonce: "nonce",
      issuer: "https://example.com/backend",
      handle: "handle",
      request,
      step: "password",
      email: 'admin+oauth@example.com"><script>alert(1)</script>'
    });
    expect(passwordPage).toContain(
      "admin+oauth@example.com&quot;&gt;&lt;script&gt;"
    );
    expect(passwordPage).toContain('type="password"');
    expect(passwordPage).not.toContain('type="password" value=');
    expect(passwordPage).not.toContain("<script>alert(1)</script>");
  });

  it("always renders a company select and human-readable scopes", () => {
    const companyPage = renderAuthorizationPage({
      nonce: "nonce",
      issuer: "https://example.com/backend",
      handle: "handle",
      request,
      step: "company",
      memberships: [
        {
          userId: 10,
          companyId: 20,
          companyName: "Clínica & Saúde",
          tokenVersion: 3
        }
      ]
    });
    expect(companyPage).toContain("Selecione sua empresa:");
    expect(companyPage).toContain('<select id="companyId"');
    expect(companyPage).toContain("Clínica &amp; Saúde");
    expect(companyPage).toContain("Ler conversas");
    expect(companyPage).toContain("Consultar relatórios");
    expect(companyPage).not.toContain(">conversations:read<");
    expect(companyPage).not.toContain(">reports:read<");
  });

  it("shows a restart-oriented message for expired sessions", () => {
    const page = renderExpiredAuthorizationPage("nonce");
    expect(page).toContain("Esta autorização expirou");
    expect(page).toContain("iniciada novamente");
    expect(page).not.toContain('name="password"');
  });
});
