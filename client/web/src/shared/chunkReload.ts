const CHUNK_RELOAD_KEY = "gamebet:chunk-reload";

/** 发版后旧页签仍引用已删除的 hashed chunk 时，自动刷新一次 */
export function installChunkReloadOnDeploy() {
  const maybeReload = (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason ?? "");
    if (!msg.includes("Failed to fetch dynamically imported module"))
      return false;
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY))
      return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.location.reload();
    return true;
  };

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    const err = (event as Event & { payload?: unknown }).payload;
    maybeReload(err ?? event);
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (maybeReload(event.reason))
      event.preventDefault();
  });
}

export function clearChunkReloadFlag() {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY);
}
