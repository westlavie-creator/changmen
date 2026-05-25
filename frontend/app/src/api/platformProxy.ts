/** OB / RAY HTTP 代理（CORS 回退；凭证在 backend platforms.json） */

export async function obProxy<T = unknown>(path: string, query = ""): Promise<T> {
  const q = query ? `&query=${encodeURIComponent(query)}` : "";
  const res = await fetch(
    `/esport/ob/proxy?path=${encodeURIComponent(path.replace(/^\//, ""))}${q}`,
  );
  if (!res.ok) throw new Error(`OB proxy HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function rayProxy<T = unknown>(path: string, query = ""): Promise<T> {
  const q = query ? `&query=${encodeURIComponent(query)}` : "";
  const res = await fetch(
    `/esport/ray/proxy?path=${encodeURIComponent(path.replace(/^\//, ""))}${q}`,
  );
  if (!res.ok) throw new Error(`RAY proxy HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** PB euro odds / balance：CORS 回退 /esport/pb/proxy?url= */
export async function pbProxy<T = unknown>(url: string): Promise<T> {
  const res = await fetch(`/esport/pb/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`PB proxy HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
