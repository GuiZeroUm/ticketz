import { useEffect, useRef } from "react";
import { useHistory, useLocation } from "react-router-dom";
import {
  markEmailOAuthReturnRedirected,
  peekEmailOAuthReturn
} from "../../helpers/emailOAuthReturn";

/**
 * Used by the logged-in layout. After the Google OAuth callback the auth
 * redirects land the user on "/"; when a Gmail connect result is waiting
 * (a handle to finish or an error to show), send them back to /connections
 * once so the Connections page can finish it. Only peeks: the handle itself
 * is handed out by consumeEmailOAuthReturn() on the Connections page.
 *
 * @param {boolean} authenticated - true once the user is loaded.
 */
const useEmailOAuthReturnRedirect = authenticated => {
  const history = useHistory();
  const location = useLocation();
  const doneRef = useRef(false);

  useEffect(() => {
    if (!authenticated || doneRef.current) return;
    const pending = peekEmailOAuthReturn();
    if (!pending || pending.redirected) return;
    doneRef.current = true;
    markEmailOAuthReturnRedirected();
    if (location.pathname !== "/connections") history.push("/connections");
  }, [authenticated, history, location.pathname]);
};

export default useEmailOAuthReturnRedirect;
