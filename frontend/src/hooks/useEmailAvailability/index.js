import { useContext, useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";

// Last known answer per company, so a later visit renders the right layout
// at once while the fresh answer loads in the background.
const cacheKey = companyId => `emailAvailability:${companyId}`;

const readCache = companyId => {
  if (!companyId) return undefined;
  try {
    const value = window.sessionStorage.getItem(cacheKey(companyId));
    if (value === "true") return true;
    if (value === "false") return false;
  } catch (_) {
    // storage unavailable
  }
  return undefined;
};

const writeCache = (companyId, enabled) => {
  try {
    window.sessionStorage.setItem(cacheKey(companyId), String(enabled));
  } catch (_) {
    // storage unavailable
  }
};

const initialState = companyId => {
  const cached = readCache(companyId);
  return {
    companyId,
    enabled: cached === true,
    // Older backends do not send gmailConfigured: keep offering Gmail.
    gmailConfigured: true,
    loading: Boolean(companyId) && cached === undefined
  };
};

const useEmailAvailability = () => {
  const { user } = useContext(AuthContext) || {};
  const companyId = user?.companyId ?? user?.company?.id ?? null;
  const [state, setState] = useState(() => initialState(companyId));
  const requestRef = useRef(0);

  useEffect(() => {
    setState(initialState(companyId));
    if (!companyId) return undefined;

    let active = true;
    const check = async () => {
      const requestId = ++requestRef.current;
      try {
        const { data } = await api.get("/email/availability");
        if (active && requestId === requestRef.current) {
          const enabled = data?.enabled === true;
          writeCache(companyId, enabled);
          setState({
            companyId,
            enabled,
            gmailConfigured: data?.gmailConfigured !== false,
            loading: false
          });
        }
      } catch (_) {
        if (active && requestId === requestRef.current)
          setState(current => ({
            companyId,
            // keep a cached answer on a transient failure
            enabled: current.companyId === companyId && current.enabled,
            gmailConfigured:
              current.companyId !== companyId || current.gmailConfigured,
            loading: false
          }));
      }
    };

    check();
    window.addEventListener("focus", check);
    window.addEventListener("email-availability-changed", check);
    return () => {
      active = false;
      window.removeEventListener("focus", check);
      window.removeEventListener("email-availability-changed", check);
    };
  }, [companyId]);

  const current =
    state.companyId === companyId ? state : initialState(companyId);
  return {
    enabled: current.enabled,
    loading: current.loading,
    gmailConfigured: current.gmailConfigured
  };
};

export default useEmailAvailability;
