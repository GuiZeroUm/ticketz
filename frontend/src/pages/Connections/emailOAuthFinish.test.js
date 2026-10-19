import React from "react";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthContext } from "../../context/Auth/AuthContext";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import { i18n } from "../../translate/i18n";
import Connections from "./index";

const mockApiPost = jest.fn();
const mockConsume = jest.fn();
const mockUpsert = jest.fn();
const mockReload = jest.fn();

jest.mock("../../services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: (...args) => mockApiPost(...args),
    put: jest.fn(),
    delete: jest.fn()
  }
}));
jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() }
}));
jest.mock("../../helpers/emailOAuthReturn", () => ({
  consumeEmailOAuthReturn: () => mockConsume()
}));
jest.mock("../../hooks/useEmailAvailability", () => () => ({
  enabled: true,
  loading: false
}));
jest.mock("../../hooks/useEmailAccounts", () => () => ({
  accounts: [],
  loading: false,
  reload: mockReload,
  upsert: mockUpsert
}));
jest.mock("../../components/MainContainer", () => ({ children }) => (
  <main>{children}</main>
));
jest.mock("../../components/MainHeader", () => ({ children }) => (
  <header>{children}</header>
));
jest.mock("../../components/WhatsAppModal", () => () => null);
jest.mock("../../components/ConfirmationModal", () => () => null);
jest.mock("../../components/QrcodeModal", () => () => null);
jest.mock("../../components/PasskeyModal", () => () => null);
jest.mock("../../components/PrivacyModal", () => () => null);
jest.mock("../../components/WavoipModal", () => () => null);
jest.mock("../../components/MetaOnboardingStatus", () => () => null);
jest.mock("../../components/AddConnectionModal", () => () => null);
jest.mock("../../components/EmailAccountModal", () => () => null);
jest.mock("../../components/StardewEmblem", () => () => null);
jest.mock("../../helpers/wavoipCallManager", () => ({
  wavoipAvailable: () => false
}));

const HANDLE = "h".repeat(43);
const ACCOUNT = {
  id: 7,
  name: "Comercial",
  address: "comercial@empresa.com",
  provider: "gmail_api",
  preset: "gmail",
  status: "connecting"
};

const page = () => (
  <MemoryRouter initialEntries={["/connections"]}>
    <AuthContext.Provider
      value={{ user: { id: 1, companyId: 1, company: { id: 1 } } }}
    >
      <WhatsAppsContext.Provider value={{ whatsApps: [], loading: false }}>
        <Connections />
      </WhatsAppsContext.Provider>
    </AuthContext.Provider>
  </MemoryRouter>
);

const renderPage = () => render(page());

// consumeEmailOAuthReturn hands the result out once, then null.
const returns = value =>
  mockConsume.mockReturnValueOnce(value).mockReturnValue(null);

describe("Connections – Gmail OAuth finish", () => {
  beforeAll(() => i18n.changeLanguage("pt"));

  beforeEach(() => {
    jest.clearAllMocks();
    mockConsume.mockReset();
  });

  it("finishes a pending handle once and adds the account", async () => {
    returns({ result: "pending", code: null, handle: HANDLE });
    mockApiPost.mockResolvedValue({ data: ACCOUNT });

    const { rerender } = renderPage();
    // a re-render must not finish the same handle again
    rerender(page());

    await waitFor(() => expect(mockUpsert).toHaveBeenCalledWith(ACCOUNT));
    const finishCalls = mockApiPost.mock.calls.filter(
      ([url]) => url === "/email/oauth/google/finish"
    );
    expect(finishCalls).toEqual([
      ["/email/oauth/google/finish", { handle: HANDLE }]
    ]);
    expect(mockReload).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(
      i18n.t("emailChannel.connections.toasts.gmailConnected")
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the translated finish error and adds nothing", async () => {
    returns({ result: "pending", code: null, handle: HANDLE });
    mockApiPost.mockRejectedValue({
      response: { status: 409, data: { error: "ERR_GMAIL_ACCOUNT_MISMATCH" } }
    });

    renderPage();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n.t("backendErrors.ERR_GMAIL_ACCOUNT_MISMATCH"),
        expect.anything()
      )
    );
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("reports an expired authorization when the handle is gone", async () => {
    returns({ result: "pending", code: null, handle: null });

    renderPage();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n.t("emailChannel.connections.errors.ERR_GMAIL_STATE"),
        expect.anything()
      )
    );
    expect(
      mockApiPost.mock.calls.some(
        ([url]) => url === "/email/oauth/google/finish"
      )
    ).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
