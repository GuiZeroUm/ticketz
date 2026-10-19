import { useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import { SocketContext } from "../../context/Socket/SocketContext";
import { toastEmailError } from "../../helpers/emailConnections";

const upsertAccount = (list, account) => {
  const index = list.findIndex(item => item.id === account.id);
  if (index === -1) return [...list, account];
  const next = [...list];
  next[index] = { ...next[index], ...account };
  return next;
};

/**
 * Email accounts of the current company, kept live through the
 * `company-${companyId}-emailAccount` socket event (admin room).
 *
 * @param {boolean} [enabled=true] - pass `useEmailAvailability().enabled`;
 *   when false nothing is fetched or subscribed (the email routes answer
 *   ERR_EMAIL_CHANNEL_DISABLED) and the list stays empty.
 * @returns {{ accounts: object[], loading: boolean, reload: function }}
 */
const useEmailAccounts = (enabled = true) => {
  const { user } = useContext(AuthContext) || {};
  const socketManager = useContext(SocketContext);
  const companyId = user?.companyId ?? user?.company?.id ?? null;
  // Identifies what the list belongs to; null while nothing should load.
  const sourceKey = enabled && companyId ? String(companyId) : null;

  const [accounts, setAccounts] = useState([]);
  const [loadedKey, setLoadedKey] = useState(null);
  const requestRef = useRef(0);
  const loadedKeyRef = useRef(null);

  // The loading state only covers the first load for a company; later
  // reloads (after a save, a disconnect or a socket reconnect) refresh the
  // list in place.
  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!sourceKey) return;
    try {
      const { data } = await api.get("/email/accounts");
      if (requestId === requestRef.current)
        setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      // Keep whatever is on screen; the page still works without the list.
      // Only the first load of a company reports the failure.
      if (
        requestId === requestRef.current &&
        loadedKeyRef.current !== sourceKey
      )
        toastEmailError(err);
    } finally {
      if (requestId === requestRef.current) {
        loadedKeyRef.current = sourceKey;
        setLoadedKey(sourceKey);
      }
    }
  }, [sourceKey]);

  useEffect(() => {
    setAccounts([]);
    setLoadedKey(null);
    loadedKeyRef.current = null;
    reload();
    return () => {
      // drop any in-flight response from a previous company / toggle state
      requestRef.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    if (!sourceKey || !socketManager?.GetSocket) return undefined;
    const socket = socketManager.GetSocket(companyId);

    const onEmailAccount = data => {
      const account = data?.account;
      if (data?.action === "delete") {
        const id = account?.id ?? data?.accountId;
        setAccounts(list => list.filter(item => item.id !== id));
        return;
      }
      if (
        (data?.action === "update" || data?.action === "create") &&
        account?.id
      ) {
        setAccounts(list => upsertAccount(list, account));
      }
    };

    const onRefreshRequired = refreshRequired => {
      if (refreshRequired) reload();
    };

    socket.on(`company-${companyId}-emailAccount`, onEmailAccount);
    socket.on("wsRefreshRequired", onRefreshRequired);
    return () => {
      socket.disconnect();
    };
  }, [sourceKey, companyId, socketManager, reload]);

  return {
    accounts: sourceKey ? accounts : [],
    loading: Boolean(sourceKey) && loadedKey !== sourceKey,
    reload
  };
};

export default useEmailAccounts;
