import { useContext, useEffect, useRef, useState } from "react";

import api from "../../services/api";
import { SocketContext } from "../../context/Socket/SocketContext";

// GET /tickets returns one page (40 tickets) and no total, so a full page is
// shown as "40+".
const PAGE_SIZE = 40;
const CHANNELS = ["all", "whatsapp", "email"];

// Ticket counts per channel for the channel chips of the inbox. Only runs
// while the email channel is enabled and an open/pending tab is visible.
const useTicketChannelCounts = ({
  enabled,
  status,
  showAll,
  queueIds,
  userQueueIds
}) => {
  const socketManager = useContext(SocketContext);
  const [counts, setCounts] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshTimer = useRef(null);
  const active = Boolean(enabled && status);

  useEffect(() => {
    if (!active) {
      setCounts(null);
      return undefined;
    }
    let alive = true;
    const allowedQueues = userQueueIds ? JSON.parse(userQueueIds) : null;
    const timer = setTimeout(async () => {
      try {
        const results = await Promise.all(
          CHANNELS.map(channel =>
            api.get("/tickets", {
              params: {
                status,
                showAll,
                queueIds,
                channel: channel === "all" ? undefined : channel
              }
            })
          )
        );
        if (!alive) return;
        const next = {};
        results.forEach(({ data }, index) => {
          const page = Array.isArray(data?.tickets) ? data.tickets : [];
          const visible = allowedQueues
            ? page.filter(ticket => allowedQueues.includes(ticket.queueId))
            : page;
          next[CHANNELS[index]] = {
            count: visible.length,
            more: page.length >= PAGE_SIZE
          };
        });
        setCounts(next);
      } catch (_) {
        // keep the last known counts on a transient failure
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active, status, showAll, queueIds, userQueueIds, refreshKey]);

  useEffect(() => {
    if (!active) return undefined;
    const companyId = localStorage.getItem("companyId");
    const socket = socketManager.GetSocket(companyId);
    const bump = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(
        () => setRefreshKey(key => key + 1),
        1500
      );
    };
    const onTicket = data => {
      if (["update", "delete", "removeFromList"].includes(data?.action)) bump();
    };
    const onMessage = data => {
      if (data?.action === "create") bump();
    };
    socket.on(`company-${companyId}-ticket`, onTicket);
    socket.on(`company-${companyId}-appMessage`, onMessage);
    return () => {
      clearTimeout(refreshTimer.current);
      socket.disconnect();
    };
  }, [active, socketManager]);

  return counts;
};

export const formatChannelCount = entry => {
  if (!entry) return "";
  return entry.more ? `${entry.count}+` : String(entry.count);
};

export default useTicketChannelCounts;
