import { useContext, useEffect, useState } from "react";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";

// Read-only list of the company's non-disabled email accounts
// ([{ id, name, address, preset, provider, status }]), open to every
// authenticated user while the email channel is enabled.
export const EMAIL_ACCOUNT_OPTIONS_PATH = "/email/accounts/options";

/**
 * Email accounts for the inbox "Filtrar por conexão" select. Unlike
 * useEmailAccounts it joins no socket room and never toasts: on any error
 * (including a 404 from an older backend) the list is empty and the select
 * offers the WhatsApp connections only.
 *
 * @param {boolean} enabled - pass `useEmailAvailability().enabled`.
 * @returns {object[]} the accounts, or [] while disabled, loading or failed.
 */
const useEmailAccountOptions = enabled => {
  const { user } = useContext(AuthContext) || {};
  const companyId = user?.companyId ?? user?.company?.id ?? null;
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    setAccounts([]);
    if (!enabled || !companyId) return undefined;
    let active = true;
    api
      .get(EMAIL_ACCOUNT_OPTIONS_PATH)
      .then(({ data }) => {
        if (active) setAccounts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // silent fallback: WhatsApp-only options
      });
    return () => {
      active = false;
    };
  }, [enabled, companyId]);

  return enabled ? accounts : [];
};

export default useEmailAccountOptions;
