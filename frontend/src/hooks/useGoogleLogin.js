import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { i18n } from "../translate/i18n";
import {
  getGoogleConfiguration,
  loadGoogleClerk,
  startGoogleSignIn,
  handleGoogleCallback,
  requiresOnlyLegalConsent,
  acceptGoogleLegal,
  exchangeGoogleSession,
  requireGoogleIntent,
  clearGoogleIntent,
  GOOGLE_CALLBACK,
  GOOGLE_COMPLETE,
  GOOGLE_CONTINUE,
  socialError
} from "../services/googleAuth";

export function googleErrorMessage(error) {
  const code = error?.response?.data?.error || error?.code;
  const key =
    {
      ERR_SOCIAL_LOGIN_NO_ACCESS: "noAccess",
      ERR_COMPANY_INACTIVE: "inactive",
      ERR_COMPANY_SUSPENDED: "inactive",
      ERR_SOCIAL_LOGIN_DISABLED: "unavailable",
      ERR_SOCIAL_LOGIN_EXPIRED: "expired"
    }[code] || "failed";
  return i18n.t(`socialLogin.${key}`);
}

export default function useGoogleLogin(exchange) {
  const { pathname } = useLocation();
  const callback = pathname.startsWith("/login/google/");
  const [config, setConfig] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(callback);
  const [error, setError] = useState("");
  const [legal, setLegal] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const client = useRef();
  const exchangeRef = useRef(exchange);
  const running = useRef(false);
  exchangeRef.current = exchange;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const configuration = await getGoogleConfiguration();
        if (callback) requireGoogleIntent(configuration);
        const clerk = await loadGoogleClerk(configuration);
        if (!live) return;
        client.current = clerk;
        setConfig(configuration);
        setReady(true);
        if (!callback) return;
        if (pathname === GOOGLE_CALLBACK) {
          await handleGoogleCallback(clerk, configuration);
        } else if (pathname === GOOGLE_COMPLETE) {
          await exchangeGoogleSession(clerk, configuration, token =>
            exchangeRef.current(token)
          );
        } else if (
          pathname === GOOGLE_CONTINUE &&
          requiresOnlyLegalConsent(clerk)
        ) {
          setLegal(true);
        } else {
          throw socialError("ERR_SOCIAL_LOGIN_INVALID");
        }
      } catch (err) {
        if (live) {
          setReady(false);
          if (callback) {
            clearGoogleIntent();
            setError(googleErrorMessage(err));
          }
        }
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [pathname, callback]);

  const start = async () => {
    if (!ready || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await startGoogleSignIn(config);
    } catch (err) {
      setError(googleErrorMessage(err));
      setBusy(false);
      running.current = false;
    }
  };
  const accept = async event => {
    event.preventDefault();
    if (!accepted || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await acceptGoogleLegal(client.current, config, accepted);
      await exchangeGoogleSession(client.current, config, token =>
        exchangeRef.current(token)
      );
    } catch (err) {
      clearGoogleIntent();
      setLegal(false);
      setError(googleErrorMessage(err));
    } finally {
      setBusy(false);
      running.current = false;
    }
  };
  return {
    callback,
    ready,
    busy,
    error,
    legal,
    accepted,
    setAccepted,
    start,
    accept
  };
}
