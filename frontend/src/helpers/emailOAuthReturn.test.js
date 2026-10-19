const HANDLE = "a".repeat(20) + "_-" + "B".repeat(21);

const load = () => {
  let mod;
  jest.isolateModules(() => {
    mod = require("./emailOAuthReturn");
  });
  return mod;
};

const visit = url => window.history.replaceState(null, "", url);

describe("emailOAuthReturn", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    visit("/");
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ["fragment", `/connections#email=pending&handle=${HANDLE}`, "", ""],
    [
      "query (legacy)",
      `/connections?email=pending&handle=${HANDLE}&tab=1`,
      "?tab=1",
      ""
    ]
  ])(
    "reads a pending handle from the %s, keeps it in memory only and hands it out once",
    (_, url, search, hash) => {
      const oauth = load();
      visit(url);
      oauth.captureEmailOAuthReturn();

      expect(window.location.pathname).toBe("/connections");
      expect(window.location.search).toBe(search);
      expect(window.location.hash).toBe(hash);
      expect(window.location.href).not.toContain(HANDLE);
      expect(JSON.stringify(window.sessionStorage)).not.toContain(HANDLE);
      expect(window.sessionStorage.getItem("emailOAuthReturn")).not.toContain(
        HANDLE
      );
      expect(oauth.peekEmailOAuthReturn()).toMatchObject({
        result: "pending"
      });

      expect(oauth.consumeEmailOAuthReturn()).toEqual({
        result: "pending",
        code: null,
        handle: HANDLE
      });
      expect(oauth.consumeEmailOAuthReturn()).toBeNull();
    }
  );

  it("prefers the fragment and strips both forms", () => {
    const oauth = load();
    visit(
      `/connections?email=error&code=ERR_GMAIL_STATE#email=pending&handle=${HANDLE}`
    );
    oauth.captureEmailOAuthReturn();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(oauth.consumeEmailOAuthReturn()).toMatchObject({
      result: "pending",
      handle: HANDLE
    });
  });

  it("leaves an unrelated fragment alone", () => {
    const oauth = load();
    visit("/connections?email=connected#section");
    oauth.captureEmailOAuthReturn();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#section");
  });

  it("loses the handle on a full reload but still reports the result", () => {
    visit(`/connections#email=pending&handle=${HANDLE}`);
    load().captureEmailOAuthReturn();
    // a fresh module instance is what a full page load gives
    const reloaded = load();
    expect(reloaded.consumeEmailOAuthReturn()).toEqual({
      result: "pending",
      code: null,
      handle: null
    });
  });

  it.each([
    ["fragment", "/connections#email=error&code=ERR_GMAIL_ACCOUNT_MISMATCH"],
    ["query", "/connections?email=error&code=ERR_GMAIL_ACCOUNT_MISMATCH"]
  ])("keeps error codes from the %s", (_, url) => {
    const oauth = load();
    visit(url);
    oauth.captureEmailOAuthReturn();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(oauth.consumeEmailOAuthReturn()).toEqual({
      result: "error",
      code: "ERR_GMAIL_ACCOUNT_MISMATCH",
      handle: null
    });
  });

  it("still accepts the legacy connected result", () => {
    const oauth = load();
    visit("/connections?email=connected");
    oauth.captureEmailOAuthReturn();
    expect(oauth.consumeEmailOAuthReturn()).toMatchObject({
      result: "connected"
    });
  });

  it("drops a malformed handle", () => {
    const oauth = load();
    visit("/connections#email=pending&handle=not%20a%20handle");
    oauth.captureEmailOAuthReturn();
    expect(window.location.hash).toBe("");
    expect(oauth.consumeEmailOAuthReturn().handle).toBeNull();
  });

  it("ignores other pages", () => {
    const oauth = load();
    visit(`/tickets#email=pending&handle=${HANDLE}`);
    oauth.captureEmailOAuthReturn();
    expect(window.location.hash).toBe(`#email=pending&handle=${HANDLE}`);
    expect(oauth.peekEmailOAuthReturn()).toBeNull();
  });

  it("keeps the marker in memory when sessionStorage throws", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    jest
      .spyOn(Object.getPrototypeOf(window.sessionStorage), "setItem")
      .mockImplementation(fail);
    jest
      .spyOn(Object.getPrototypeOf(window.sessionStorage), "getItem")
      .mockImplementation(fail);
    jest
      .spyOn(Object.getPrototypeOf(window.sessionStorage), "removeItem")
      .mockImplementation(fail);

    const oauth = load();
    visit(`/connections#email=pending&handle=${HANDLE}`);
    oauth.captureEmailOAuthReturn();
    expect(window.location.hash).toBe("");
    expect(oauth.peekEmailOAuthReturn()).toMatchObject({ result: "pending" });
    oauth.markEmailOAuthReturnRedirected();
    expect(oauth.peekEmailOAuthReturn()).toMatchObject({ redirected: true });
    expect(oauth.consumeEmailOAuthReturn()).toEqual({
      result: "pending",
      code: null,
      handle: HANDLE
    });
    expect(oauth.consumeEmailOAuthReturn()).toBeNull();
  });
});
