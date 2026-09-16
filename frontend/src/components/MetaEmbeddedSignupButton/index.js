import React, { useEffect, useRef, useState } from "react";
import { Button, CircularProgress } from "@material-ui/core";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

let sdkLoadPromise = null;

// Carrega o SDK JS do Facebook uma unica vez (so quando a empresa esta em
// modo "meta" - nao pesa o bundle/rede de quem nunca usa API oficial).
const loadFacebookSdk = appId => {
  if (window.FB) return Promise.resolve();
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: false,
        version: "v21.0"
      });
      resolve();
    };

    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.onerror = reject;
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
};

// Botao "Conectar via Meta": dispara o Embedded Signup (login do proprio
// cliente, ele escolhe a WABA/numero dele) e manda o code pro backend
// trocar por token - nunca aceitamos token colado manualmente.
// Meta nao garante que o postMessage WA_EMBEDDED_SIGNUP/FINISH (disparado
// pelo popup) chegue antes do callback do FB.login rodar - as duas coisas
// sao assincronas e independentes. Por isso o callback nao le a ref direto:
// ele espera (com timeout) por quem chegar primeiro.
const SIGNUP_DATA_TIMEOUT_MS = 4000;

const MetaEmbeddedSignupButton = ({ whatsAppId, configId, appId, onConnected }) => {
  const [loading, setLoading] = useState(false);
  const signupDataRef = useRef(null);
  const pendingResolveRef = useRef(null);

  useEffect(() => {
    const handleMessage = event => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          const signupData = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
            businessId: data.data?.business_id
          };
          signupDataRef.current = signupData;
          if (pendingResolveRef.current) {
            pendingResolveRef.current(signupData);
            pendingResolveRef.current = null;
          }
        }
      } catch {
        // mensagens de outros propositos do dominio facebook.com, ignorar
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const waitForSignupData = () => {
    if (signupDataRef.current) return Promise.resolve(signupDataRef.current);

    return new Promise(resolve => {
      pendingResolveRef.current = resolve;
      setTimeout(() => {
        if (pendingResolveRef.current === resolve) {
          pendingResolveRef.current = null;
          resolve(null);
        }
      }, SIGNUP_DATA_TIMEOUT_MS);
    });
  };

  const handleClick = async () => {
    if (!appId || !configId) {
      toast.error(
        "Configuração do App Meta ausente (META_APP_ID/META_CONFIG_ID)."
      );
      return;
    }

    setLoading(true);
    try {
      await loadFacebookSdk(appId);

      window.FB.login(
        response => {
          (async () => {
            if (response.authResponse?.code) {
              const { wabaId, phoneNumberId, businessId } =
                (await waitForSignupData()) || {};

              if (!wabaId || !phoneNumberId) {
                toast.error(
                  "Não foi possível identificar a WABA/número escolhidos."
                );
                setLoading(false);
                return;
              }

              try {
                const { data } = await api.post(
                  `/whatsapp/${whatsAppId}/meta/connect`,
                  {
                    code: response.authResponse.code,
                    wabaId,
                    phoneNumberId,
                    businessId
                  }
                );
                toast.success(i18n.t("connections.toasts.metaConnected"));
                onConnected && onConnected(data);
              } catch (err) {
                toastError(err);
              }
            }
            setLoading(false);
          })();
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            feature: "whatsapp_embedded_signup",
            sessionInfoVersion: "3"
          }
        }
      );
    } catch {
      toast.error("Não foi possível carregar o login da Meta.");
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outlined"
      color="primary"
      size="small"
      disabled={loading}
      onClick={handleClick}
      startIcon={loading ? <CircularProgress size={16} /> : null}
    >
      {i18n.t("connections.buttons.connectMeta")}
    </Button>
  );
};

export default MetaEmbeddedSignupButton;
