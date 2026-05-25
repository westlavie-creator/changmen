/** A8 Yn.get/post 回退：/esport/http-relay + x-proxy-url */

function isLikelyCorsOrNetwork(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch|cors|networkerror/i.test(msg);
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON: ${text.slice(0, 120)}`);
  }
}

export async function relayFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("x-proxy-url", url);
  if (!headers.has("Accept")) headers.set("Accept", "application/json, text/plain, */*");
  return fetch("/esport/http-relay", { ...init, headers });
}

export async function fetchWithRelay<T>(url: string, init: RequestInit = {}): Promise<T> {
  try {
    const res = await fetch(url, init);
    return parseJsonResponse<T>(res);
  } catch (err) {
    if (!isLikelyCorsOrNetwork(err)) throw err;
    const res = await relayFetch(url, init);
    return parseJsonResponse<T>(res);
  }
}

export { isLikelyCorsOrNetwork };
