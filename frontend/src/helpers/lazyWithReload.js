import { lazy } from "react";

const RELOAD_KEY = "chunk-reload-at";
const RECENT_RELOAD_MS = 30000;

export const isChunkLoadError = error =>
  Boolean(error) &&
  (error.name === "ChunkLoadError" ||
    /Loading chunk/i.test(String(error.message || "")));

const reloadedRecently = () => {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY));
    return at > 0 && Date.now() - at < RECENT_RELOAD_MS;
  } catch (e) {
    return false;
  }
};

const markReload = () => {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch (e) {
    // sessionStorage may be blocked; the reload still happens.
  }
};

// A tab opened before a deploy asks for chunks that no longer exist. Reload
// once to pick up the new index.html; the promise stays pending meanwhile so
// React does not render the error. A second failure inside the window rethrows.
export const loadWithReload = factory =>
  factory().catch(error => {
    if (isChunkLoadError(error) && !reloadedRecently()) {
      markReload();
      window.location.reload();
      return new Promise(() => {});
    }
    throw error;
  });

const lazyWithReload = factory => lazy(() => loadWithReload(factory));

export default lazyWithReload;
