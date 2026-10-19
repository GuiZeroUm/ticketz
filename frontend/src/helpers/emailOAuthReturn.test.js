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

  it("keeps a pending handle in memory only and hands it out once", () => {
    const oauth = load();
    visit(`/connections?email=pending&handle=${HANDLE}&tab=1`);
    oauth.captureEmailOAuthReturn();

    expect(window.location.search).toBe("?tab=1");
    expect(JSON.stringify(window.sessionStorage)).not.toContain(HANDLE);
    expect(window.sessionStorage.getItem("emailOAuthReturn")).not.toContain(
      HANDLE
    );
    expect(oauth.peekEmailOAuthReturn()).toMatchObject({ result: "pending" });

    expect(oauth.consumeEmailOAuthReturn()).toEqual({
      result: "pending",
      code: null,
      handle: HANDLE
    });
    expect(oauth.consumeEmailOAuthReturn()).toBeNull();
  });

  it("loses the handle on a full reload but still reports the result", () => {
    visit(`/connections?email=pending&handle=${HANDLE}`);
    load().captureEmailOAuthReturn();
    // a fresh module instance is what a full page load gives
    const reloaded = load();
    expect(reloaded.consumeEmailOAuthReturn()).toEqual({
      result: "pending",
      code: null,
      handle: null
    });
  });

  it("keeps error codes and still accepts the legacy connected result", () => {
    const oauth = load();
    visit("/connections?email=error&code=ERR_GMAIL_ACCOUNT_MISMATCH");
    oauth.captureEmailOAuthReturn();
    expect(window.location.search).toBe("");
    expect(oauth.consumeEmailOAuthReturn()).toEqual({
      result: "error",
      code: "ERR_GMAIL_ACCOUNT_MISMATCH",
      handle: null
    });

    visit("/connections?email=connected");
    oauth.captureEmailOAuthReturn();
    expect(oauth.consumeEmailOAuthReturn()).toMatchObject({
      result: "connected"
    });
  });

  it("drops a malformed handle", () => {
    const oauth = load();
    visit("/connections?email=pending&handle=not%20a%20handle");
    oauth.captureEmailOAuthReturn();
    expect(window.location.search).toBe("");
    expect(oauth.consumeEmailOAuthReturn().handle).toBeNull();
  });
});
