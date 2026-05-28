import { SABA_PAGE_PATH } from "@/collectors/saba/core";

/** SABA 电竞页 HTML（A8 插件 Yn.get；此处为页面 fetch 直连） */
export async function fetchSabaEsportsPage(session: {
  gateway: string;
  token: string;
  sportPath?: string;
}): Promise<string> {
  const url = SABA_PAGE_PATH(session.gateway, session.token, session.sportPath ?? "43");
  const headers = {
    Accept: "text/html,application/xhtml+xml,*/*",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  };
  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 160) || `HTTP ${res.status}`);
  return text;
}
