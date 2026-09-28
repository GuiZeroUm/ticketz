import React, { useEffect, useRef, useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography
} from "@material-ui/core";
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
    script.onerror = error => {
      sdkLoadPromise = null;
      script.remove();
      reject(error);
    };
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

const MetaEmbeddedSignupButton = ({
  whatsAppId,
  configId,
  appId,
  onConnected
}) => {
  const [loading, setLoading] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [sdkReady, setSdkReady] = useState(() => !!window.FB);
  const [sdkLoading, setSdkLoading] = useState(false);
  const [sdkAttempt, setSdkAttempt] = useState(0);

  // Prepare the SDK before clicking so FB.login retains browser user activation.
  useEffect(() => {
    if (!appId || !configId) return undefined;
    let active = true;
    setSdkLoading(true);
    loadFacebookSdk(appId)
      .then(() => {
        if (active) setSdkReady(true);
      })
      .catch(() => {
        if (active) {
          setSdkReady(false);
          toast.error(i18n.t("connections.meta.loginFailed"));
        }
      })
      .finally(() => {
        if (active) setSdkLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appId, configId, sdkAttempt]);
  const signupDataRef = useRef(null);
  const pendingResolveRef = useRef(null);

  useEffect(() => {
    const handleMessage = event => {
      if (
        ![
          "https://www.facebook.com",
          "https://web.facebook.com",
          "https://business.facebook.com"
        ].includes(event.origin)
      )
        return;
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

  const handleClick = () => {
    if (!appId || !configId) {
      toast.error(i18n.t("connections.meta.missingConfig"));
      return;
    }

    if (!sdkReady) {
      setSdkAttempt(attempt => attempt + 1);
      return;
    }

    if (!/^\d{6}$/.test(pin)) return;
    signupDataRef.current = null;
    setLoading(true);
    try {
      window.FB.login(
        response => {
          (async () => {
            if (response.authResponse?.code) {
              const { wabaId, phoneNumberId, businessId } =
                (await waitForSignupData()) || {};

              if (!wabaId || !phoneNumberId) {
                toast.error(i18n.t("connections.meta.missingNumber"));
                setLoading(false);
                return;
              }

              try {
                const { data } = await api.post(
                  `/whatsapp/${whatsAppId}/meta/connect`,
                  {
                    code: response.authResponse.code,
                    pin,
                    wabaId,
                    phoneNumberId,
                    businessId
                  }
                );
                setPin("");
                setPinDialogOpen(false);
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
      toast.error(i18n.t("connections.meta.loginFailed"));
      setLoading(false);
    }
  };

  const closePinDialog = () => {
    if (loading) return;
    setPinDialogOpen(false);
    setPin("");
  };

  if (!appId || !configId) {
    return (
      <Typography variant="body2" color="textSecondary">
        {i18n.t("connections.meta.missingConfig")}
      </Typography>
    );
  }

  return (
    <>
      <Button
        variant="outlined"
        color="primary"
        size="small"
        disabled={loading || sdkLoading}
        onClick={() => {
          if (!appId || !configId) {
            toast.error(i18n.t("connections.meta.missingConfig"));
          } else if (!sdkReady) {
            setSdkAttempt(attempt => attempt + 1);
          } else {
            setPinDialogOpen(true);
          }
        }}
        startIcon={
          loading || sdkLoading ? <CircularProgress size={16} /> : null
        }
      >
        {i18n.t("connections.buttons.connectMeta")}
      </Button>
      <Dialog
        open={pinDialogOpen}
        onClose={closePinDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{i18n.t("connections.meta.pinTitle")}</DialogTitle>
        <DialogContent>
          <TextField
            id={`meta-registration-pin-${whatsAppId}`}
            autoFocus
            fullWidth
            type="password"
            autoComplete="new-password"
            label={i18n.t("connections.meta.pinLabel")}
            helperText={i18n.t("connections.meta.pinHelp")}
            value={pin}
            disabled={loading}
            inputProps={{
              inputMode: "numeric",
              maxLength: 6,
              pattern: "[0-9]{6}"
            }}
            onChange={event =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closePinDialog} disabled={loading}>
            {i18n.t("templateMessageModal.buttons.cancel")}
          </Button>
          <Button
            onClick={handleClick}
            color="primary"
            disabled={loading || !sdkReady || !/^\d{6}$/.test(pin)}
          >
            {i18n.t("connections.meta.continueSignup")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MetaEmbeddedSignupButton;
