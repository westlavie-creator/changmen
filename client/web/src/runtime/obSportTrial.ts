/**
 * 官网熊猫体育试玩：dbgaming.com「立即試玩」→ GET /yewu6/user/tryPlay。
 * 与九游商户壳无关；返回 token + 进馆 URL，网关即 tryPlay 所在 API 域。
 */

export const PANDA_SPORT_TRYPLAY_URL
  = "https://api.dbsporxxxw1box.com/yewu6/user/tryPlay?lang=zh&terminal=PC";
export const PANDA_SPORT_TRIAL_GATEWAY = "https://api.dbsporxxxw1box.com";
export const PANDA_SPORT_TRIAL_SHELL = "https://user-pc-new.dbgaming.com";

export type PandaSportTrialPaste = {
  provider: "OB";
  kind: "sport";
  token: string;
  gateway: string[];
  referer: string;
  href: string;
  userName?: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function originSlash(href: string): string {
  try {
    const u = new URL(href);
    return `${u.protocol}//${u.host}/`;
  }
  catch {
    return "";
  }
}

function isHexSportToken(token: string): boolean {
  return /^[0-9a-f]{16,}$/i.test(token) && !/^\d+$/.test(token);
}

export function parsePandaSportTryPlay(envelope: unknown): PandaSportTrialPaste {
  const root = asObject(envelope);
  if (!root)
    throw new Error("试玩 token 响应无法解析");
  const code = root.code == null ? "" : String(root.code);
  const ok = root.status === true || code === "0000000" || code === "0";
  if (!ok)
    throw new Error(String(root.msg || root.message || code || "试玩 token 失败"));
  const data = asObject(root.data) || root;
  const token = String(data.token || "").trim();
  if (!isHexSportToken(token))
    throw new Error("试玩响应未返回体育 token");
  const loginUrl = String(data.loginUrl || "").trim();
  const domain = String(data.domain || "").trim().replace(/\/$/, "") || PANDA_SPORT_TRIAL_SHELL;
  const href = loginUrl || `${domain}?token=${token}&gr=common`;
  const referer = originSlash(href) || `${PANDA_SPORT_TRIAL_SHELL}/`;
  const userName = String(data.userName || "").trim();
  const row: PandaSportTrialPaste = {
    provider: "OB",
    kind: "sport",
    token,
    gateway: [PANDA_SPORT_TRIAL_GATEWAY],
    referer,
    href,
  };
  if (userName)
    row.userName = userName;
  return row;
}

export function formatPandaSportTrialPaste(row: PandaSportTrialPaste): string {
  return JSON.stringify(row, null, 2);
}

export async function fetchPandaSportTrialRow(): Promise<PandaSportTrialPaste> {
  const res = await fetch(PANDA_SPORT_TRYPLAY_URL, {
    method: "GET",
    headers: { Accept: "application/json, text/plain, */*" },
  });
  if (!res.ok)
    throw new Error(`试玩 token HTTP ${res.status}`);
  return parsePandaSportTryPlay(await res.json());
}

export async function fetchPandaSportTrialPaste(): Promise<string> {
  return formatPandaSportTrialPaste(await fetchPandaSportTrialRow());
}
