import { useCallback, useEffect, useRef } from "react";

// Returns a stable function that runs `callback` once, `delayMs` after the
// first call of a burst. Calls made while the timer is pending are absorbed.
// The latest `callback` is the one that runs, and a pending run is cancelled
// when the component unmounts.
export default function useTrailingCallback(callback, delayMs) {
  const callbackRef = useRef(callback);
  const timerRef = useRef(null);

  callbackRef.current = callback;

  useEffect(
    () => () => {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    },
    []
  );

  return useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      callbackRef.current();
    }, delayMs);
  }, [delayMs]);
}
