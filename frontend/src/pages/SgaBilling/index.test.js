import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SgaBilling from "./index";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));
jest.mock("../../context/Auth/AuthContext", () => ({
  AuthContext: require("react").createContext({})
}));
jest.mock("../../services/api", () => ({
  get: jest.fn(),
  put: jest.fn(),
  post: jest.fn()
}));
jest.mock("../../errors/toastError", () => jest.fn());
const config = {
  enabled: false,
  whatsappId: null,
  timezone: "America/Rio_Branco",
  startHour: 9,
  endHour: 17,
  dailyLimit: 100,
  weekdays: [1, 2, 3, 4, 5],
  termsReviewed: false,
  excludedContactIds: [],
  steps: [-3, 0, 1, 3, 5, 25, 30, 90].map(offset => ({
    offset,
    enabled: true,
    attachPdf: offset <= 0,
    body: "Olá, [nome]. Lembrete de teste."
  }))
};
const state = {
  config,
  day: "2026-09-14",
  liveAllowed: false,
  testNumber: "5568992081954",
  fresh: true,
  connections: [{ id: 10, name: "DEV", status: "DISCONNECTED" }],
  counts: { total: 0, eligible: 0, blocked: 0 },
  preview: [],
  history: []
};
const view = (profile = "admin") => (
  <MemoryRouter>
    <AuthContext.Provider value={{ user: { id: 1, companyId: 9, profile } }}>
      <SgaBilling />
    </AuthContext.Provider>
  </MemoryRouter>
);
beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation(async url => ({
    data: url.includes("/preview/")
      ? { body: "Olá, Guilherme Santos.", attachPdf: true }
      : state
  }));
});
it("only administrators can access billing controls", () => {
  render(view("user"));
  expect(screen.getByText("sga.billing.adminOnly")).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
});
it("defaults to validation mode, shows all 8 steps, and blocks live send without connection", async () => {
  render(view());
  await screen.findByText("sga.billing.safeMode");
  expect(
    screen.getByRole("checkbox", { name: "sga.billing.enabled" }).disabled
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "sga.billing.sendTest" }).disabled
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "sga.billing.simulate" }).disabled
  ).toBe(false);
  expect(
    screen.getByRole("button", { name: "sga.billing.stages.90" })
  ).toBeTruthy();
});
it("previews the personalized message and synthetic PDF without sending", async () => {
  render(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "sga.billing.preview" })
  );
  expect(await screen.findByTestId("billing-preview")).toHaveProperty(
    "textContent",
    "Olá, Guilherme Santos."
  );
  expect(
    screen.getByRole("button", { name: "sga.billing.downloadTestPdf" })
  ).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
});
it("labels an authorized real boleto and never offers a synthetic download for it", async () => {
  api.get.mockImplementation(async url => ({
    data: url.includes("/preview/")
      ? {
          body: "TESTE DE ENVIO — BOLETO REAL",
          attachPdf: true,
          realBill: true
        }
      : { ...state, testBillNumber: "30041" }
  }));
  render(view());
  await screen.findByText("sga.billing.realTestHelp");
  fireEvent.click(
    await screen.findByRole("button", { name: "sga.billing.preview" })
  );
  await screen.findByTestId("billing-preview");
  expect(
    screen.queryByRole("button", { name: "sga.billing.downloadTestPdf" })
  ).toBeNull();
  expect(api.post).not.toHaveBeenCalled();
});
it("simulation submits no phone override and clearly distinguishes it from WhatsApp delivery", async () => {
  api.post.mockResolvedValue({
    data: { status: "SIMULATED", body: "Prévia", attachPdf: true }
  });
  render(view());
  fireEvent.click(
    await screen.findByRole("button", { name: "sga.billing.simulate" })
  );
  await screen.findByText("sga.billing.result.SIMULATED");
  expect(api.post).toHaveBeenCalledWith("/sga/billing/test", {
    mode: "simulation",
    stage: -3,
    requestId: expect.any(String)
  });
  fireEvent.click(screen.getByRole("button", { name: "sga.billing.simulate" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[0][1].requestId).toBe(
    api.post.mock.calls[1][1].requestId
  );
});
it("unsaved edits require saving before preview or send", async () => {
  render(view());
  const input = await screen.findByRole("textbox", {
    name: "sga.billing.stages.-3"
  });
  fireEvent.change(input, { target: { value: "Nova mensagem para [nome]" } });
  expect(
    screen.getByRole("button", { name: "sga.billing.preview" }).disabled
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "sga.billing.simulate" }).disabled
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "sga.billing.save" }).disabled
  ).toBe(false);
});
