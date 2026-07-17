/** 由 web 在启动时注入；venue-adapter 拼 WS/HTTP 鉴权 URL 时读取。 */
type AuthTokenGetter = () => string | null | undefined;

let _getter: AuthTokenGetter | null = null;

export function setChangmenAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _getter = getter;
}

function readTokenFromStorage(): string {
  try {
    if (typeof localStorage !== "undefined") {
      const fromLs = String(localStorage.getItem("app:token") || "").trim();
      if (fromLs)
        return fromLs;
    }
  }
  catch {
    /* ignore */
  }
  try {
    if (typeof document === "undefined")
      return "";
    const m = document.cookie.match(/(?:^|; )app_token=([^;]*)/);
    return m ? decodeURIComponent(m[1]).trim() : "";
  }
  catch {
    return "";
  }
}

export function getChangmenAuthToken(): string {
  try {
    const fromGetter = String(_getter?.() || "").trim();
    if (fromGetter)
      return fromGetter;
  }
  catch {
    /* fall through */
  }
  return readTokenFromStorage();
}
