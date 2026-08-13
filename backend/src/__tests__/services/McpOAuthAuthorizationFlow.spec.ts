import Company from "../../models/Company";
import McpAudit from "../../models/McpAudit";
import Setting from "../../models/Setting";
import User from "../../models/User";
import { cacheLayer } from "../../libs/cache";
import {
  AuthorizationSession,
  assertCompanyEligible,
  authenticateAuthorizationPassword,
  consumeAuthorizationSelection,
  submitAuthorizationEmail
} from "../../services/McpServices/OAuthService";

const request = {
  clientId: "ticketz_client",
  redirectUri: "https://chatgpt.com/connector/oauth/example",
  state: "state",
  codeChallenge: "a".repeat(43),
  resource: "http://localhost:8080",
  scopes: ["conversations:read", "reports:read"]
};

const session = (
  overrides: Partial<AuthorizationSession> = {}
): AuthorizationSession => ({
  request,
  step: "password",
  expiresAt: Date.now() + 10 * 60 * 1000,
  email: "admin@example.com",
  ...overrides
});

const userWithCompany = (input: {
  id: number;
  companyId: number;
  companyName: string;
  passwordMatches: boolean;
  status?: boolean;
  tokenVersion?: number;
}): User => {
  const company = Company.build({
    id: input.companyId,
    name: input.companyName,
    status: input.status ?? true,
    dueDate: null
  });
  const user = User.build({
    id: input.id,
    companyId: input.companyId,
    profile: "admin",
    tokenVersion: input.tokenVersion ?? 0
  });
  user.company = company;
  user.checkPassword = jest.fn().mockResolvedValue(input.passwordMatches);
  return user;
};

describe("MCP OAuth multi-company authorization", () => {
  beforeEach(() => {
    jest.spyOn(McpAudit, "create").mockResolvedValue({} as McpAudit);
    jest.spyOn(cacheLayer, "set").mockResolvedValue("OK" as never);
    jest
      .spyOn(Setting, "findOne")
      .mockResolvedValue({ value: "enabled" } as Setting);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("advances after a valid email without querying whether it exists", async () => {
    jest
      .spyOn(cacheLayer, "get")
      .mockResolvedValue(
        JSON.stringify(session({ step: "email", email: undefined }))
      );
    const userLookup = jest.spyOn(User, "findAll");

    const result = await submitAuthorizationEmail(
      "handle",
      "ADMIN@example.com"
    );

    expect(result.step).toBe("password");
    expect(result.email).toBe("admin@example.com");
    expect(userLookup).not.toHaveBeenCalled();
    const storedSession = String(
      (cacheLayer.set as jest.Mock).mock.calls[0][1]
    );
    expect(storedSession).not.toContain('"password":');
    expect(cacheLayer.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "EX",
      expect.any(Number)
    );
  });

  it("keeps only admin memberships whose individual password matches", async () => {
    jest.spyOn(cacheLayer, "get").mockResolvedValue(JSON.stringify(session()));
    const first = userWithCompany({
      id: 1,
      companyId: 11,
      companyName: "Empresa A",
      passwordMatches: false
    });
    const second = userWithCompany({
      id: 2,
      companyId: 22,
      companyName: "Empresa B",
      passwordMatches: true,
      tokenVersion: 4
    });
    jest.spyOn(User, "findAll").mockResolvedValue([first, second]);

    const result = await authenticateAuthorizationPassword(
      "handle",
      "admin@example.com",
      "different-per-company"
    );

    expect(User.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ profile: "admin" })
      })
    );
    expect(result.memberships).toEqual([
      {
        userId: 2,
        companyId: 22,
        companyName: "Empresa B",
        tokenVersion: 4
      }
    ]);
  });

  it("does not close the session after an incorrect password", async () => {
    jest.spyOn(cacheLayer, "get").mockResolvedValue(JSON.stringify(session()));
    jest.spyOn(User, "findAll").mockResolvedValue([]);
    const consume = jest.spyOn(cacheLayer, "consume");

    await expect(
      authenticateAuthorizationPassword(
        "handle",
        "admin@example.com",
        "incorrect"
      )
    ).rejects.toMatchObject({ message: "invalid_credentials" });
    expect(consume).not.toHaveBeenCalled();
  });

  it("filters inactive companies and companies outside the MCP pilot", async () => {
    const inactive = Company.build({ id: 30, status: false, dueDate: null });
    await expect(assertCompanyEligible(inactive)).rejects.toMatchObject({
      message: "company_inactive"
    });

    jest.spyOn(Setting, "findOne").mockResolvedValueOnce(null);
    const disabled = Company.build({ id: 31, status: true, dueDate: null });
    await expect(assertCompanyEligible(disabled)).rejects.toMatchObject({
      message: "mcp_pilot_disabled"
    });
  });

  it("rejects a tampered company before consuming the handle", async () => {
    jest.spyOn(cacheLayer, "get").mockResolvedValue(
      JSON.stringify(
        session({
          step: "company",
          memberships: [
            {
              userId: 1,
              companyId: 40,
              companyName: "Empresa autorizada",
              tokenVersion: 0
            }
          ]
        })
      )
    );
    const consume = jest.spyOn(cacheLayer, "consume");

    await expect(
      consumeAuthorizationSelection("handle", 999)
    ).rejects.toMatchObject({ message: "invalid_company_selection" });
    expect(consume).not.toHaveBeenCalled();
  });

  it("consumes the authenticated handle once and revalidates tokenVersion", async () => {
    const companySession = session({
      step: "company",
      memberships: [
        {
          userId: 5,
          companyId: 50,
          companyName: "Empresa",
          tokenVersion: 7
        }
      ]
    });
    jest
      .spyOn(cacheLayer, "get")
      .mockResolvedValue(JSON.stringify(companySession));
    jest
      .spyOn(cacheLayer, "consume")
      .mockResolvedValueOnce(JSON.stringify(companySession))
      .mockResolvedValueOnce(null);
    const user = userWithCompany({
      id: 5,
      companyId: 50,
      companyName: "Empresa",
      passwordMatches: true,
      tokenVersion: 7
    });
    jest.spyOn(User, "findOne").mockResolvedValue(user);

    const selected = await consumeAuthorizationSelection("handle", 50);
    expect(selected.company.id).toBe(50);
    expect(User.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenVersion: 7, profile: "admin" })
      })
    );

    await expect(
      consumeAuthorizationSelection("handle", 50)
    ).rejects.toMatchObject({ message: "authorization_request_expired" });
  });
});
