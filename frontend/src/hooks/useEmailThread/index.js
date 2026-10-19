import { useCallback, useContext, useEffect, useRef, useState } from "react";

import api from "../../services/api";
import { SocketContext } from "../../context/Socket/SocketContext";

// Loads GET /email/tickets/:ticketId/thread and refetches it whenever an
// appMessage event for this ticket arrives (new email, send status change).
const useEmailThread = ticketId => {
  const socketManager = useContext(SocketContext);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    if (!ticketId) return;
    const requestId = ++requestRef.current;
    try {
      const { data } = await api.get(`/email/tickets/${ticketId}/thread`);
      if (requestId !== requestRef.current) return;
      setThread(data);
      setError(null);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(err?.response?.data?.error || "ERR_UNKNOWN");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [ticketId]);

  const reload = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(load, 300);
  }, [load]);

  useEffect(() => {
    setThread(null);
    setError(null);
    setLoading(true);
    load();
    return () => {
      requestRef.current += 1;
      clearTimeout(timerRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (!ticketId) return undefined;
    const companyId = localStorage.getItem("companyId");
    const socket = socketManager.GetSocket(companyId);

    socketManager.onConnect(() => {
      socket.emit("joinChatBox", `${ticketId}`);
    });

    const onAppMessage = data => {
      const messageTicketId = data?.message?.ticketId ?? data?.ticket?.id;
      if (Number(messageTicketId) === Number(ticketId)) reload();
    };
    const onRefresh = refreshRequired => {
      if (refreshRequired) reload();
    };

    socket.on(`company-${companyId}-appMessage`, onAppMessage);
    socket.on("wsRefreshRequired", onRefresh);

    return () => socket.disconnect();
  }, [ticketId, socketManager, reload]);

  return { thread, loading, error, reload };
};

export default useEmailThread;
