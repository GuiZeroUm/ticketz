const ENV_KEYS = ["FRONTEND_URL", "FRONTEND_CUSTOM_URL", "FRONTEND_URL_REGEX"];
const saved: Record<string, string | undefined> = {};

const setEnv = (values: Record<string, string | undefined>) => {
  ENV_KEYS.forEach(key => {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  });
};

// corsOrigin is computed when the module loads, so each case loads it afresh.
const load = () => {
  let mod: typeof import("../../helpers/corsOrigin");
  jest.isolateModules(() => {
    mod = jest.requireActual("../../helpers/corsOrigin");
  });
  return mod;
};

const corsAllows = (
  corsOrigin: unknown,
  origin: string | undefined
): boolean => {
  let allowed = false;
  (corsOrigin as (o: string, cb: (e: Error, a?: boolean) => void) => void)(
    origin,
    (err, allow) => {
      allowed = !err && Boolean(allow);
    }
  );
  return allowed;
};

beforeAll(() => {
  ENV_KEYS.forEach(key => {
    saved[key] = process.env[key];
  });
});

afterAll(() => setEnv(saved));

describe("isAllowedFrontendOrigin", () => {
  it("accepts FRONTEND_URL even with a trailing slash", () => {
    setEnv({ FRONTEND_URL: "https://app.espacowhats.com.br/" });
    const { isAllowedFrontendOrigin } = load();
    expect(isAllowedFrontendOrigin("https://app.espacowhats.com.br")).toBe(
      true
    );
    expect(isAllowedFrontendOrigin("https://other.espacowhats.com.br")).toBe(
      false
    );
  });

  it("accepts FRONTEND_CUSTOM_URL entries and FRONTEND_URL_REGEX matches", () => {
    setEnv({
      FRONTEND_URL: "https://app.espacowhats.com.br",
      FRONTEND_CUSTOM_URL: "https://painel.cliente.com , https://x.y",
      FRONTEND_URL_REGEX: "^https://[a-z0-9-]+\\.espacowhats\\.com\\.br$"
    });
    const { isAllowedFrontendOrigin } = load();
    expect(isAllowedFrontendOrigin("https://painel.cliente.com")).toBe(true);
    expect(isAllowedFrontendOrigin("https://x.y")).toBe(true);
    expect(isAllowedFrontendOrigin("https://teste.espacowhats.com.br")).toBe(
      true
    );
  });

  it.each([
    "https://teste.espacowhats.com.br/",
    "https://teste.espacowhats.com.br/connections",
    "https://teste.espacowhats.com.br?x=1",
    "https://user@teste.espacowhats.com.br",
    "https://teste.espacowhats.com.br@evil.com",
    "https://evil.com/.espacowhats.com.br",
    "javascript://teste.espacowhats.com.br",
    "null",
    "",
    undefined,
    42
  ])("rejects %p, which is not an exact allowed origin", origin => {
    setEnv({
      FRONTEND_URL: "https://app.espacowhats.com.br",
      FRONTEND_URL_REGEX: "^https://.*\\.espacowhats\\.com\\.br"
    });
    const { isAllowedFrontendOrigin } = load();
    expect(isAllowedFrontendOrigin(origin)).toBe(false);
  });

  it("treats an invalid FRONTEND_URL_REGEX as no match instead of throwing", () => {
    setEnv({ FRONTEND_URL: "https://a.com", FRONTEND_URL_REGEX: "([" });
    const { isAllowedFrontendOrigin } = load();
    expect(isAllowedFrontendOrigin("https://b.com")).toBe(false);
    expect(isAllowedFrontendOrigin("https://a.com")).toBe(true);
  });
});

describe("corsOrigin", () => {
  it("stays the plain FRONTEND_URL string without custom origins", () => {
    setEnv({ FRONTEND_URL: "https://app.espacowhats.com.br" });
    expect(load().corsOrigin).toBe("https://app.espacowhats.com.br");
  });

  it("uses the shared rules when custom origins are configured", () => {
    setEnv({
      FRONTEND_URL: "https://app.espacowhats.com.br",
      FRONTEND_URL_REGEX: "^https://[a-z0-9-]+\\.espacowhats\\.com\\.br$"
    });
    const { corsOrigin } = load();
    expect(typeof corsOrigin).toBe("function");
    expect(corsAllows(corsOrigin, "https://teste.espacowhats.com.br")).toBe(
      true
    );
    expect(corsAllows(corsOrigin, "https://app.espacowhats.com.br")).toBe(true);
    expect(corsAllows(corsOrigin, undefined)).toBe(true);
    expect(corsAllows(corsOrigin, "https://evil.com")).toBe(false);
  });
});
