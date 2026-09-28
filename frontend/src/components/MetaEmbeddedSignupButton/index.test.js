import React from "react";
import "@testing-library/jest-dom";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act
} from "@testing-library/react";
import { toast } from "react-toastify";
import api from "../../services/api";
import MetaEmbeddedSignupButton from "./index";

jest.mock("../../services/api", () => ({ post: jest.fn() }));
jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() }
}));
jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));

const dispatchEmbeddedSignupFinish = (origin = "https://www.facebook.com") => {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin,
      data: JSON.stringify({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH",
        data: {
          waba_id: "waba-1",
          phone_number_id: "phone-1",
          business_id: "biz-1"
        }
      })
    })
  );
};

describe("MetaEmbeddedSignupButton signup data race", () => {
  let fbLoginCallback;

  beforeEach(() => {
    jest.clearAllMocks();
    fbLoginCallback = null;
    window.FB = {
      init: jest.fn(),
      login: jest.fn((callback, _opts) => {
        fbLoginCallback = callback;
      })
    };
  });

  afterEach(() => {
    delete window.FB;
  });

  it("ignores lookalike Facebook origins", async () => {
    api.post.mockResolvedValue({ data: { id: 9 } });
    render(
      <MetaEmbeddedSignupButton
        whatsAppId={9}
        appId="app-1"
        configId="config-1"
      />
    );
    const button = screen.getByRole("button", {
      name: "connections.buttons.connectMeta"
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText("connections.meta.pinLabel"), {
      target: { value: "012345" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "connections.meta.continueSignup" })
    );
    // Must happen synchronously during the click, before user activation expires.
    expect(window.FB.login).toHaveBeenCalled();
    dispatchEmbeddedSignupFinish("https://evilfacebook.com");
    fbLoginCallback({ authResponse: { code: "auth-code" } });
    await Promise.resolve();
    expect(api.post).not.toHaveBeenCalled();
    dispatchEmbeddedSignupFinish();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  });

  it("still captures the WABA/phone number when FB.login's callback fires before the postMessage arrives", async () => {
    api.post.mockResolvedValue({ data: { id: 9 } });
    const onConnected = jest.fn();

    render(
      <MetaEmbeddedSignupButton
        whatsAppId={9}
        appId="app-1"
        configId="config-1"
        onConnected={onConnected}
      />
    );

    const button = screen.getByRole("button", {
      name: "connections.buttons.connectMeta"
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText("connections.meta.pinLabel"), {
      target: { value: "012345" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "connections.meta.continueSignup" })
    );
    // Must happen synchronously during the click, before user activation expires.
    expect(window.FB.login).toHaveBeenCalled();

    // FB's own callback fires first; the WA_EMBEDDED_SIGNUP postMessage
    // (sent by the popup) only arrives afterwards - this ordering is not
    // guaranteed by Meta's docs and is the race this test reproduces.
    fbLoginCallback({ authResponse: { code: "auth-code" } });
    dispatchEmbeddedSignupFinish();

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/whatsapp/9/meta/connect", {
      code: "auth-code",
      pin: "012345",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      businessId: "biz-1"
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(onConnected).toHaveBeenCalledWith({ id: 9 });
  });
});

it("preloads the SDK before enabling the popup action", async () => {
  delete window.FB;
  const append = jest.spyOn(document.body, "appendChild");
  render(
    <MetaEmbeddedSignupButton
      whatsAppId={9}
      appId="app-1"
      configId="config-1"
    />
  );
  const button = screen.getByRole("button", {
    name: "connections.buttons.connectMeta"
  });
  expect(button).toBeDisabled();
  expect(
    append.mock.calls.some(
      ([node]) => node.src === "https://connect.facebook.net/en_US/sdk.js"
    )
  ).toBe(true);
  window.FB = { init: jest.fn(), login: jest.fn() };
  // fbAsyncInit belongs to the external SDK, outside Testing Library events.
  await act(async () => {
    window.fbAsyncInit();
  });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  const continueButton = screen.getByRole("button", {
    name: "connections.meta.continueSignup"
  });
  expect(continueButton).toBeDisabled();
  fireEvent.change(screen.getByLabelText("connections.meta.pinLabel"), {
    target: { value: "012345" }
  });
  fireEvent.click(continueButton);
  expect(window.FB.login).toHaveBeenCalledTimes(1);
  append.mockRestore();
  delete window.FB;
});

it("shows administrator setup guidance when Embedded Signup is not configured", () => {
  render(
    <MetaEmbeddedSignupButton whatsAppId={9} appId="app-1" configId={null} />
  );
  expect(
    screen.getByText("connections.meta.missingConfig")
  ).toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
