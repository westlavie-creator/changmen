/** 由 web 在启动时注入；venue-adapter 拼 WS/HTTP 鉴权 URL 时读取。 */
type AuthTokenGetter = () => string | null | undefined;

let _getter: AuthTokenGetter | null = null;

export function setChangmenAuthTokenGetter(getter: AuthTokenGetter | null): void {
  _getter = getter;
}

export function getChangmenAuthToken(): string {
  try {
    return String(_getter?.() || "").trim();
  }
  catch {
    return "";
  }
}
