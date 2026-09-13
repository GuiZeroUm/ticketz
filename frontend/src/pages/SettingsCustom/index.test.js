import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../../context/Auth/AuthContext";
import { toast } from "react-toastify";
import SettingsCustom from "./index";

const mockFind = jest.fn();
const mockGetAllSettings = jest.fn();
const mockUpdateSchedules = jest.fn();
const mockApiGet = jest.fn();

jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));
jest.mock("../../context/Auth/AuthContext", () => ({
  AuthContext: require("react").createContext({ user: {} })
}));
jest.mock("../../hooks/useCompanies", () => () => ({
  find: mockFind,
  updateSchedules: mockUpdateSchedules
}));
jest.mock("../../hooks/useSettings", () => () => ({
  getAll: mockGetAllSettings
}));
jest.mock("../../services/api", () => ({
  get: (...args) => mockApiGet(...args)
}));
jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() }
}));
jest.mock("../../components/interface", () => ({ useIdentidade: () => ({}) }));
jest.mock("../../components/Settings/ResumoFilas", () => () => (
  <div>Queues</div>
));
jest.mock("../../components/MainContainer", () => ({ children }) => (
  <main>{children}</main>
));
jest.mock("../../components/MainHeader", () => ({ children }) => (
  <header>{children}</header>
));
jest.mock("../../components/CabecalhoPagina", () => ({ titulo }) => (
  <h1>{titulo}</h1>
));
jest.mock("../../components/SchedulesForm", () => () => (
  <div>Legacy schedules</div>
));
jest.mock("../../components/OpenHoursEditor", () => () => (
  <div>Open hours editor</div>
));
jest.mock("../../components/CompaniesManager", () => () => (
  <div>Company management</div>
));
jest.mock("../../components/PlansManager", () => () => (
  <div>Plan management</div>
));
jest.mock("../../components/HelpsManager", () => () => (
  <div>Help management</div>
));
jest.mock("../../components/PartnersManager", () => () => (
  <div>Partner management</div>
));
jest.mock("../../components/Settings/Options", () => () => (
  <div>General options</div>
));
jest.mock("../../components/Settings/Whitelabel", () => ({ settings }) => (
  <div data-testid="branding-editor">{JSON.stringify(settings)}</div>
));
jest.mock("../../components/Settings/PaymentGateway", () => () => (
  <div>Payment management</div>
));
jest.mock("../../components/Settings/I18nSettings", () => () => (
  <div>Translation management</div>
));
jest.mock("../../components/VoiceSettings", () => () => (
  <div>Voice settings</div>
));

const admin = { profile: "admin", super: false, companyId: 17 };
const brandingSettings = [
  { key: "appLogoLight", value: "branding/17/logo-light.png" },
  { key: "loginHeadline", value: "Sua marca, seu atendimento" },
  { key: "scheduleType", value: "company" }
];

function settingsPage(user = admin) {
  return (
    <MemoryRouter>
      <AuthContext.Provider value={{ user }}>
        <SettingsCustom />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

function selectTab(name) {
  // Radix tabs activate on pointer-down (or keyboard), not on a bare click.
  fireEvent.mouseDown(screen.getByRole("tab", { name }), {
    button: 0,
    ctrlKey: false
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("companyId", "999");
  mockFind.mockResolvedValue({ id: 17, schedules: {} });
  mockGetAllSettings.mockResolvedValue(brandingSettings);
  mockApiGet.mockRejectedValue(new Error("Voice feature is unavailable"));
});

it("shows the admin branding tab and loads its settings even when the company request is forbidden", async () => {
  mockFind.mockRejectedValue(new Error("403 company access denied"));
  render(settingsPage());

  // Visibility comes from the authenticated user, not an unrelated API response.
  expect(
    screen.getByRole("tab", { name: "loginExperience.brandTab" })
  ).toBeTruthy();
  selectTab("loginExperience.brandTab");

  await waitFor(() => {
    expect(
      JSON.parse(screen.getByTestId("branding-editor").textContent)
    ).toEqual(brandingSettings);
  });
  expect(mockFind).toHaveBeenCalledWith(17);
  expect(mockGetAllSettings).toHaveBeenCalledTimes(1);
  expect(toast.error).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("tab", { name: "centralConfig.administracao" })
  ).toBeNull();

  selectTab("centralConfig.atendimento");
  expect(
    screen.getByRole("button", { name: /centralConfig.itens.horarios.titulo/ })
  ).toBeTruthy();
});

it.each([
  [{ profile: "user", super: false, companyId: 17 }, false, false],
  [{ profile: "admin", super: false, companyId: 17 }, true, false],
  [{ profile: "admin", super: true, companyId: 17 }, true, true],
  [{ profile: "user", super: true, companyId: 17 }, false, true],
  [{}, false, false]
])(
  "keeps branding and superuser access separate for %j",
  async (user, branding, superuser) => {
    render(settingsPage(user));
    await waitFor(() => expect(mockGetAllSettings).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(
      Boolean(screen.queryByRole("tab", { name: "loginExperience.brandTab" }))
    ).toBe(branding);
    expect(
      Boolean(
        screen.queryByRole("tab", { name: "centralConfig.administracao" })
      )
    ).toBe(superuser);
    if (branding) {
      selectTab("loginExperience.brandTab");
      expect(screen.getByTestId("branding-editor")).toBeTruthy();
    } else {
      expect(screen.queryByTestId("branding-editor")).toBeNull();
    }
    selectTab("centralConfig.equipe");
    expect(
      Boolean(
        screen.queryByRole("button", {
          name: /centralConfig.itens.ajuda.titulo/
        })
      )
    ).toBe(branding);

    if (superuser) {
      selectTab("centralConfig.administracao");
      fireEvent.click(
        screen.getByRole("button", {
          name: /centralConfig.itens.empresas.titulo/
        })
      );
      expect(screen.getByText("Company management")).toBeTruthy();
    } else {
      expect(screen.queryByText("Company management")).toBeNull();
    }
  }
);

it("keeps the branding editor reachable and reports a translated error when settings fail", async () => {
  mockGetAllSettings.mockRejectedValue(new Error("503 settings unavailable"));
  render(settingsPage());
  selectTab("loginExperience.brandTab");

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith(
      "loginExperience.settingsLoadError"
    )
  );
  expect(JSON.parse(screen.getByTestId("branding-editor").textContent)).toEqual(
    []
  );
  expect(
    screen.getByRole("tab", { name: "loginExperience.brandTab" })
  ).toBeTruthy();
});

it("normalizes invalid settings responses without hiding branding or enabling schedules", async () => {
  mockGetAllSettings.mockResolvedValue({ error: "unexpected response" });
  render(settingsPage());
  selectTab("loginExperience.brandTab");
  await act(async () => {});

  expect(JSON.parse(screen.getByTestId("branding-editor").textContent)).toEqual(
    []
  );
  selectTab("centralConfig.atendimento");
  expect(
    screen.queryByRole("button", {
      name: /centralConfig.itens.horarios.titulo/
    })
  ).toBeNull();
});

it.each([
  ["admin", true],
  ["user", false]
])(
  "keeps voice settings admin-only when the voice API is available (%s)",
  async (profile, allowed) => {
    mockApiGet.mockResolvedValue({ data: [] });
    render(settingsPage({ ...admin, profile }));
    await act(async () => {});
    selectTab("centralConfig.canais");

    expect(
      Boolean(
        screen.queryByRole("button", { name: /centralConfig.itens.voz.titulo/ })
      )
    ).toBe(allowed);
  }
);

it("responds to authenticated role changes without needing another settings request", async () => {
  const { rerender } = render(settingsPage({ ...admin, profile: "user" }));
  await act(async () => {});
  expect(
    screen.queryByRole("tab", { name: "loginExperience.brandTab" })
  ).toBeNull();

  rerender(settingsPage(admin));
  selectTab("loginExperience.brandTab");
  expect(JSON.parse(screen.getByTestId("branding-editor").textContent)).toEqual(
    brandingSettings
  );
  expect(mockGetAllSettings).toHaveBeenCalledTimes(1);

  rerender(settingsPage({ ...admin, profile: "user" }));
  expect(
    screen.queryByRole("tab", { name: "loginExperience.brandTab" })
  ).toBeNull();
  expect(screen.queryByTestId("branding-editor")).toBeNull();
});

it("does not publish errors from the initial request after unmounting", async () => {
  let rejectSettings;
  mockGetAllSettings.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        rejectSettings = reject;
      })
  );
  const { unmount } = render(settingsPage());
  await act(async () => {});
  unmount();

  await act(async () => rejectSettings(new Error("Late response")));
  expect(toast.error).not.toHaveBeenCalled();
});

it.each(["resolve", "reject"])(
  "does not update voice state when a pending request settles after unmount (%s)",
  async outcome => {
    let finishRequest;
    mockApiGet.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          finishRequest = outcome === "resolve" ? resolve : reject;
        })
    );
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { unmount } = render(settingsPage());
      await act(async () => {});
      unmount();

      await act(async () => {
        finishRequest(
          outcome === "resolve" ? { data: [] } : new Error("Late voice failure")
        );
      });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  }
);
