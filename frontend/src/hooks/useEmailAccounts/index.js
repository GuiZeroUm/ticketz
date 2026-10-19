import { useCallback, useContext, useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import { SocketContext } from "../../context/Socket/SocketContext";

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
 * @param {boolean} enabled - when false nothing is fetched (email channel
 *   disabled for the company) and the list stays empty.
 * @returns {{ accounts: object[], loading: boolean, reload: function }}
 */
const useEmailAccounts = (enabled = true) => {
  const { user } = useContext(AuthContext) || {};
  const socketManager = useContext(SocketContext);
  const companyId = user?.companyId ?? user?.company?.id ?? null;
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const requestRef = useRef(0);
  const loadedRef = useRef(false);

  // Only the first load of a company shows the loading state; later reloads
  // (after a save or disconnect) refresh the list in place.
  const reload = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!enabled || !companyId) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    if (!loadedRef.current) setLoading(true);
    try {
      const { data } = await api.get("/email/accounts");
      if (requestId === requestRef.current) {
        setAccounts(Array.isArray(data) ? data : []);
        loadedRef.current = true;
      }
    } catch (_) {
      if (requestId === requestRef.current && !loadedRef.current)
        setAccounts([]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [enabled, companyId]);

  useEffect(() => {
    loadedRef.current = false;
    setAccounts([]);
    reload();
    return () => {
      // drop any in-flight response from a previous company / toggle state
      requestRef.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    if (!enabled || !companyId || !socketManager?.GetSocket) return undefined;
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

    socket.on(`company-${companyId}-emailAccount`, onEmailAccount);
    return () => {
      socket.disconnect();
    };
  }, [enabled, companyId, socketManager]);

  return { accounts: enabled ? accounts : [], loading, reload };
};

export default useEmailAccounts;
