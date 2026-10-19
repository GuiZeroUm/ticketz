import { useContext, useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";

const useEmailAvailability = () => {
  const { user } = useContext(AuthContext) || {};
  const companyId = user?.companyId ?? user?.company?.id ?? null;
  const [state, setState] = useState({
    companyId: null,
    enabled: false,
    loading: true
  });
  const requestRef = useRef(0);

  useEffect(() => {
    setState({ companyId, enabled: false, loading: Boolean(companyId) });
    if (!companyId) return undefined;

    let active = true;
    const check = async () => {
      const requestId = ++requestRef.current;
      try {
        const { data } = await api.get("/email/availability");
        if (active && requestId === requestRef.current)
          setState({
            companyId,
            enabled: data?.enabled === true,
            loading: false
          });
      } catch (_) {
        if (active && requestId === requestRef.current)
          setState({ companyId, enabled: false, loading: false });
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

  const current = state.companyId === companyId;
  return {
    enabled: current && state.enabled,
    loading: current ? state.loading : Boolean(companyId)
  };
};

export default useEmailAvailability;
