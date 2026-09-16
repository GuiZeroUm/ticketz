import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { toast } from "react-toastify";
import api from "../../services/api";
import MetaEmbeddedSignupButton from "./index";

jest.mock("../../services/api", () => ({ post: jest.fn() }));
jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("../../translate/i18n", () => ({ i18n: { t: key => key } }));

const dispatchEmbeddedSignupFinish = () => {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: "https://www.facebook.com",
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

    fireEvent.click(screen.getByText("connections.buttons.connectMeta"));
    await waitFor(() => expect(window.FB.login).toHaveBeenCalled());

    // FB's own callback fires first; the WA_EMBEDDED_SIGNUP postMessage
    // (sent by the popup) only arrives afterwards - this ordering is not
    // guaranteed by Meta's docs and is the race this test reproduces.
    fbLoginCallback({ authResponse: { code: "auth-code" } });
    dispatchEmbeddedSignupFinish();

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/whatsapp/9/meta/connect", {
      code: "auth-code",
      wabaId: "waba-1",
      phoneNumberId: "phone-1",
      businessId: "biz-1"
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(onConnected).toHaveBeenCalledWith({ id: 9 });
  });
});
