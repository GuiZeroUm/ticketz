import React from "react";
import "@testing-library/jest-dom";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act
} from "@testing-library/react";
import MetaOnboardingStatus from "./index";
import api from "../../services/api";

jest.mock("../../services/api", () => ({ get: jest.fn() }));
jest.mock("../../translate/i18n", () => ({
  i18n: { t: (key, values) => (values?.id ? `${key}: ${values.id}` : key) }
}));
jest.mock("../MetaEmbeddedSignupButton", () => ({ onConnected }) => (
  <button onClick={() => onConnected({ id: 9 })}>
    Connect customer account
  </button>
));

const config = {
  appId: "app",
  configId: "config",
  graphApiVersion: "v23.0",
  billingMode: "direct"
};
const whatsapp = { id: 9, status: "CONNECTED" };
const connected = {
  connectionStatus: "CONNECTED",
  wabaId: "customer-waba",
  phoneNumberId: "customer-phone",
  billingMode: "direct",
  billingStatus: "unverified",
  billingManagementUrl: "https://business.facebook.com/billing_hub"
};
beforeEach(() => jest.clearAllMocks());

it("keeps Meta billing unverified after opening billing or refreshing an active connection", async () => {
  api.get.mockResolvedValue({ data: connected });
  render(
    <MetaOnboardingStatus whatsapp={whatsapp} config={config} companyId={2} />
  );
  expect(
    await screen.findByText("connections.meta.billingUnverified")
  ).toBeInTheDocument();
  expect(
    screen.getByText("connections.meta.wabaLabel: customer-waba")
  ).toBeInTheDocument();
  expect(
    screen.getByText("connections.meta.billingSeparate")
  ).toBeInTheDocument();
  const billing = screen.getByRole("link", {
    name: "connections.meta.openBilling"
  });
  expect(billing).toHaveAttribute("href", connected.billingManagementUrl);
  expect(billing).toHaveAttribute("rel", "noopener noreferrer");
  fireEvent.click(billing);
  expect(
    screen.getByText("connections.meta.billingUnverified")
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "connections.meta.refreshStatus" })
  );
  expect(
    await screen.findByText("connections.meta.billingUnverified")
  ).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
});

it("loads customer billing guidance after completing the connection without reloading the page", async () => {
  api.get
    .mockResolvedValueOnce({
      data: {
        ...connected,
        connectionStatus: "DISCONNECTED",
        wabaId: null,
        billingManagementUrl: null
      }
    })
    .mockResolvedValueOnce({ data: connected });
  render(
    <MetaOnboardingStatus
      whatsapp={{ id: 9, status: "DISCONNECTED" }}
      config={config}
      companyId={2}
    />
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Connect customer account" })
  );
  expect(
    await screen.findByRole("link", { name: "connections.meta.openBilling" })
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Connect customer account" })
  ).not.toBeInTheDocument();
});

it("does not send customers to a non-Meta payment page", async () => {
  api.get.mockResolvedValue({
    data: {
      ...connected,
      billingManagementUrl: "https://evilfacebook.com/billing_hub"
    }
  });
  render(
    <MetaOnboardingStatus whatsapp={whatsapp} config={config} companyId={2} />
  );
  await screen.findByText("connections.meta.billingUnverified");
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("retries a failed status request without inventing a payment result", async () => {
  api.get
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ data: connected });
  render(
    <MetaOnboardingStatus whatsapp={whatsapp} config={config} companyId={2} />
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "connections.meta.statusFailed"
  );
  fireEvent.click(
    screen.getByRole("button", { name: "connections.meta.refreshStatus" })
  );
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  );
  expect(
    await screen.findByText("connections.meta.billingUnverified")
  ).toBeInTheDocument();
});

it("ignores a late status response after switching companies", async () => {
  let resolveOld;
  api.get
    .mockReturnValueOnce(
      new Promise(resolve => {
        resolveOld = resolve;
      })
    )
    .mockResolvedValueOnce({
      data: { ...connected, wabaId: "new-company-waba" }
    });
  const { rerender } = render(
    <MetaOnboardingStatus whatsapp={whatsapp} config={config} companyId={2} />
  );
  rerender(
    <MetaOnboardingStatus
      whatsapp={{ id: 10, status: "CONNECTED" }}
      config={config}
      companyId={3}
    />
  );
  await screen.findByText("connections.meta.wabaLabel: new-company-waba");
  await act(async () => {
    resolveOld({ data: connected });
  });
  expect(
    screen.queryByText("connections.meta.wabaLabel: customer-waba")
  ).not.toBeInTheDocument();
  expect(
    screen.getByText("connections.meta.wabaLabel: new-company-waba")
  ).toBeInTheDocument();
});
