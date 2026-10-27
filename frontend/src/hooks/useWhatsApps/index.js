import { useState, useEffect, useReducer, useContext } from "react";
import api from "../../services/api";
import { SocketContext } from "../../context/Socket/SocketContext";
import { AuthContext } from "../../context/Auth/AuthContext";

const reducer = (state, action) => {
  if (action.type === "LOAD_WHATSAPPS") {
    const whatsApps = action.payload;

    return [...whatsApps];
  }

  if (action.type === "UPDATE_WHATSAPPS") {
    const whatsApp = action.payload;
    const whatsAppIndex = state.findIndex(s => s.id === whatsApp.id);

    if (whatsAppIndex !== -1) {
      state[whatsAppIndex] = whatsApp;
      return [...state];
    } else {
      return [whatsApp, ...state];
    }
  }

  if (action.type === "UPDATE_SESSION") {
    const whatsApp = action.payload;
    const whatsAppIndex = state.findIndex(s => s.id === whatsApp.id);

    if (whatsAppIndex !== -1) {
      state[whatsAppIndex].status = whatsApp.status;
      state[whatsAppIndex].updatedAt = whatsApp.updatedAt;
      state[whatsAppIndex].qrcode = whatsApp.qrcode;
      state[whatsAppIndex].retries = whatsApp.retries;
      return [...state];
    } else {
      return [...state];
    }
  }

  if (action.type === "DELETE_WHATSAPPS") {
    const whatsAppId = action.payload;

    const whatsAppIndex = state.findIndex(s => s.id === whatsAppId);
    if (whatsAppIndex !== -1) {
      state.splice(whatsAppIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useWhatsApps = () => {
  const [whatsApps, dispatch] = useReducer(reducer, []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  const socketManager = useContext(SocketContext);
  const { isAuth, loading: authLoading, user } = useContext(AuthContext);
  const companyId = user?.companyId ?? user?.company?.id;

  useEffect(() => {
    if (authLoading || !isAuth || !companyId) {
      dispatch({ type: "RESET" });
      setLoadError(false);
      setLoading(authLoading);
      return undefined;
    }

    let active = true;
    setLoading(true);
    setLoadError(false);
    const fetchSession = async () => {
      try {
        const { data } = await api.get("/whatsapp");
        if (active) dispatch({ type: "LOAD_WHATSAPPS", payload: data });
      } catch (_) {
        if (active) {
          dispatch({ type: "RESET" });
          setLoadError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchSession();
    return () => {
      active = false;
    };
  }, [authLoading, isAuth, companyId, reloadVersion]);

  useEffect(() => {
    if (authLoading || !isAuth || !companyId) return undefined;
    const socket = socketManager.GetSocket(companyId);

    const onCompanyWhatsapp = data => {
      if (data.action === "update") {
        dispatch({ type: "UPDATE_WHATSAPPS", payload: data.whatsapp });
      }
      if (data.action === "delete") {
        dispatch({ type: "DELETE_WHATSAPPS", payload: data.whatsappId });
      }
    };

    const onCompanyWhatsappSession = data => {
      if (data.action === "update") {
        dispatch({ type: "UPDATE_SESSION", payload: data.session });
      }
    };

    socket.on(`company-${companyId}-whatsapp`, onCompanyWhatsapp);
    socket.on(`company-${companyId}-whatsappSession`, onCompanyWhatsappSession);

    return () => {
      socket.disconnect();
    };
  }, [socketManager, authLoading, isAuth, companyId]);

  return {
    whatsApps,
    loading,
    loadError,
    reload: () => setReloadVersion(version => version + 1)
  };
};

export default useWhatsApps;
