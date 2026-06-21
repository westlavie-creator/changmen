import type { PlatformId } from "@/types/esport";
import { ElLoading, ElMessage, ElMessageBox } from "element-plus";
import { authHeaders } from "@/api/client";
import { a8PluginPost, hasA8PluginRuntime } from "@/chrome-plugin/bridge";
import { gamebetExtensionId } from "@/config/gamebetExtension";
import { useUserStore } from "@/stores/userStore";

/** 对齐 A8 bundle UserCollectView：RMe / FMe / WMe / uY */
export const CREDIT_PLATE_PASSWORD = "a123456";
/** 对齐 A8 bundle + `a8_dev_credentials` A8_USER */
export const CREDIT_PLATE_USER = "TJ01";
/** [A8 可证实] bundle `AIe`（2.0.245，替代 `game.haijings.vip`） */
export const CREDIT_FORWARD_SITE = "api.a8.to";
export const CREDIT_PB_GAME_ID = 3;
/** 对齐 A8 `l(TF)` → gameId 5 */
export const CREDIT_TF_GAME_ID = 5;
/** 对齐 A8 `l(IM)` → gameId 9 */
export const CREDIT_IM_GAME_ID = 9;

const CREDIT_V4_GAME_IDS: Partial<Record<PlatformId, number>> = {
  PB: CREDIT_PB_GAME_ID,
  TF: CREDIT_TF_GAME_ID,
  IM: CREDIT_IM_GAME_ID,
};
/** 对齐 A8 bundle `gY`：浏览器直连 OB 试玩登录 */
export const OB_DEMO_LOGIN_URL
  = "https://djtop-capi.v662n.com/cApi/v2/member/login?merchant=6107384714184464&demo=1";
export const SABA_DEMO_URL
  = "https://www.sabab2b.com/zh-CN/freetrial/demo?platform=Mobile&site=liteDemo&skin=7";

interface V4Envelope<T = unknown> {
  success: 0 | 1;
  msg?: string;
  info?: T;
}

interface ObDemoResponse {
  status?: boolean | number | string;
  message?: string;
  data?: { pc?: string };
}

const A8_V4_REMOTE_BASE = "https://api.a8.to/v4.0/";

function isLocalDevHost(): boolean {
  if (typeof window === "undefined")
    return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * 对齐 A8 `UserCollectView` 内 `i(d,f)`：
 *   localhost / 127.0.0.1 → `https://api.a8.to/v4.0/`
 *   其它 → 同源 `/v4.0/`（backend 转发）
 * `VITE_V4_PROXY=1` 强制走本地代理；`VITE_V4_BASE_URL` 可覆盖。
 */
function resolveV4BaseUrl(): string {
  const custom = import.meta.env.VITE_V4_BASE_URL;
  if (custom && String(custom).trim()) {
    const base = String(custom).trim();
    return base.endsWith("/") ? base : `${base}/`;
  }
  if (import.meta.env.VITE_V4_PROXY === "1") {
    return "/v4.0/";
  }
  if (isLocalDevHost()) {
    return A8_V4_REMOTE_BASE;
  }
  if (import.meta.env.VITE_V4_DIRECT === "1") {
    return A8_V4_REMOTE_BASE;
  }
  return "/v4.0/";
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 平博 v4 账号：对齐 A8 `o.userName` + `TIe` 密码。
 * 已登录非 admin 用当前用户名；否则回落 TJ01（与 backend resolveCreditPlateUserName 一致）。
 */
async function resolveCreditPlateUserName(): Promise<string> {
  const user = useUserStore();
  const logged = user.userName.trim();
  if (logged && logged !== "admin")
    return logged;
  if (user.creditPlateUserName.trim())
    return user.creditPlateUserName.trim();
  const fromSetting = user.setting?.a8UserName;
  if (typeof fromSetting === "string" && fromSetting.trim()) {
    return fromSetting.trim();
  }
  try {
    const res = await fetch("/api/a8/credit-plate-user", { headers: authHeaders() });
    if (res.ok) {
      const body = (await res.json()) as { userName?: string };
      const name = body.userName?.trim();
      if (name) {
        user.creditPlateUserName = name;
        return name;
      }
    }
  }
  catch {
    /* 后端未启动时用 TJ01 */
  }
  return CREDIT_PLATE_USER;
}

function unwrapPluginV4<T>(response: unknown): V4Envelope<T> {
  let payload: unknown = response;
  if (response && typeof response === "object" && "data" in response) {
    payload = (response as { data: unknown }).data;
  }
  if (typeof payload === "string") {
    return JSON.parse(payload) as V4Envelope<T>;
  }
  if (payload && typeof payload === "object" && "success" in payload) {
    return payload as V4Envelope<T>;
  }
  throw new Error("A8 插件 v4 响应格式异常");
}

/** 对齐 A8 bundle `Yn.post`：由 Chrome 扩展在浏览器上下文请求 api.a8.to（无 CORS、不易被 CF 拦 Node） */
async function v4PostViaPlugin<T>(
  path: string,
  formBody: string,
  headers: Record<string, string>,
): Promise<V4Envelope<T>> {
  const url = `${resolveV4BaseUrl()}${path}`;
  const response = await a8PluginPost(url, formBody, {
    headers,
    withCredentials: true,
  });
  return unwrapPluginV4<T>(response);
}

function cloudflareProxyHint(): string {
  return (
    `api.a8.to 被 Cloudflare 拦截（本地 Node 代理无法访问）。请安装并启用 Gamebet 扩展（${gamebetExtensionId()}），`
    + "由扩展代发 v4 请求；或换可访问 A8 的网络。localhost 勿设 VITE_V4_DIRECT=1（会 CORS）。"
  );
}

/**
 * 对齐 bundle `i(d,f)`：优先 A8 插件 POST，否则同源 `/v4.0/` → backend → api.a8.to。
 */
async function v4Post<T>(
  path: string,
  body: Record<string, string | number>,
  token = "",
): Promise<V4Envelope<T>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.set(key, String(value));
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded;",
    "x-forwarded-site": CREDIT_FORWARD_SITE,
  };
  if (token)
    headers.token = token;

  const formBody = params.toString();

  if (hasA8PluginRuntime()) {
    try {
      if (import.meta.env.DEV) {
        console.info("[v4] POST via A8 plugin", `${resolveV4BaseUrl()}${path}`, formBody);
      }
      return await v4PostViaPlugin<T>(path, formBody, headers);
    }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (import.meta.env.DEV)
        console.warn("[v4] A8 插件代发失败，回退 /v4.0/ 代理", msg);
    }
  }

  const base = resolveV4BaseUrl();
  const url = `${base}${path}`;
  const direct = base.startsWith("https://");
  if (import.meta.env.DEV) {
    console.info("[v4] POST", url, { direct, via: "fetch", body: formBody });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: formBody,
      credentials: direct ? "include" : "same-origin",
    });
  }
  catch {
    const viaProxy = base.startsWith("/");
    const hint = viaProxy
      ? hasA8PluginRuntime()
        ? "v4 代理失败；请确认 A8 扩展已启用，或检查 3456 后端是否运行"
        : cloudflareProxyHint()
      : `浏览器无法访问 ${url}（CORS）。请用 /v4.0/ 代理，并安装 A8 扩展`;
    ElMessage.error(hint);
    return { success: 0, msg: hint };
  }
  const raw = await res.text();
  try {
    const json = JSON.parse(raw) as V4Envelope<T>;
    if (
      json.success === 0
      && json.info
      && typeof json.info === "object"
      && (json.info as { code?: string }).code === "A8CloudflareBlocked"
    ) {
      const hint = cloudflareProxyHint();
      ElMessage.error(hint);
      return { success: 0, msg: hint, info: json.info };
    }
    return json;
  }
  catch {
    const viaProxy = base.startsWith("/");
    const cf = /cloudflare|cf-error|you have been blocked/i.test(raw);
    let hint: string;
    if (viaProxy && cf) {
      hint = cloudflareProxyHint();
    }
    else if (cf) {
      hint = "api.a8.to 被 Cloudflare 拦截：请安装 A8 扩展或先在浏览器打开 A8 主站后重试";
    }
    else if (res.status === 403) {
      hint = "api.a8.to 返回 403，请检查网络或账号";
    }
    else {
      hint = `v4 响应非 JSON (HTTP ${res.status})，请查看 Network 中该请求的 URL 与响应体`;
    }
    if (import.meta.env.DEV)
      console.warn("[v4] 非 JSON 响应", res.status, raw.slice(0, 200));
    ElMessage.error(hint);
    return { success: 0, msg: hint };
  }
}

/**
 * v4 登录 + game/play/Login（对齐 A8 `l(d,f)` 两步 API）。
 */
async function fetchV4PlayUrl(userName: string, gameId: number): Promise<string | null> {
  let v4Token = "";
  const login = await v4Post<{ token?: string }>(
    "user/account/login",
    { userName, password: CREDIT_PLATE_PASSWORD },
    v4Token,
  );
  if (login.success !== 1) {
    const code
      = login.info && typeof login.info === "object" && "code" in login.info
        ? String((login.info as { code?: string }).code)
        : "";
    if (code === "A8CloudflareBlocked") {
      ElMessage.error(cloudflareProxyHint());
    }
    else {
      ElMessage.error(login.msg || "登录失败");
    }
    return null;
  }
  const loginInfo = login.info as { token?: string; Token?: string } | undefined;
  v4Token = loginInfo?.token ?? loginInfo?.Token ?? "";
  if (!v4Token) {
    ElMessage.error("登录失败：未返回 token");
    return null;
  }

  const play = await v4Post<{ Url?: string; url?: string }>(
    "game/play/Login",
    { gameId },
    v4Token,
  );
  if (play.success !== 1) {
    const detail
      = play.info && typeof play.info === "object" && "code" in play.info
        ? ` (${String((play.info as { code?: string }).code)})`
        : "";
    ElMessage.error((play.msg || "进入游戏失败") + detail);
    return null;
  }
  const playInfo = play.info as { Url?: string; url?: string } | undefined;
  const url = (playInfo?.Url ?? playInfo?.url ?? "").trim();
  if (!url || url === "about:blank") {
    ElMessage.error(
      play.msg
      || "进入游戏失败：A8 未返回游戏 Url（请确认 api.a8.to 可访问且账号有效）",
    );
    return null;
  }
  return url;
}

/** 对齐 bundle `Lc.confirm(…).then(() => window.open(…))`：确认后只打开标签页，不再发 v4 请求 */
function confirmAndOpenGame(platform: PlatformId, url: string): void {
  ElMessageBox.confirm(`确认要进入${platform}吗？`, String(platform), {
    confirmButtonText: "进入游戏",
    cancelButtonText: "取消",
    type: "warning",
    center: true,
  })
    .then(() => {
      const tab = window.open(url, String(platform));
      if (!tab) {
        ElMessage.warning("浏览器拦截了弹窗，请允许本站弹出窗口后，再点「进入游戏」");
      }
    })
    .catch(() => {
      /* 用户点取消 */
    });
}

/** 对齐 bundle `u(OB)`：GET 试玩登录 URL，返回 pc 地址 */
async function fetchObDemoUrl(): Promise<string | null> {
  const res = await fetch(OB_DEMO_LOGIN_URL);
  const body = (await res.json()) as ObDemoResponse;
  if (!body.status) {
    ElMessage.error(body.message || "OB 试玩登录失败");
    return null;
  }
  const pc = body.data?.pc;
  if (!pc) {
    ElMessage.error("OB 试玩登录失败：未返回 pc 地址");
    return null;
  }
  return pc;
}

/** 对齐 bundle `c(SABA)`：无 loading，直接打开试玩页 */
function enterSabaDemo(): void {
  window.open(SABA_DEMO_URL, "SABA");
}

/**
 * 信用盘入口（对齐 A8 `l(d)` / `u(d)`）：
 * API 完成后立即 Lc.confirm（不 await），finally 里 wait(1s) 再关 Loading。
 */
export async function enterCreditPlate(platform: PlatformId): Promise<void> {
  if (platform === "SABA") {
    enterSabaDemo();
    return;
  }

  const loading = ElLoading.service({
    lock: true,
    text: "正在进入游戏",
    background: "rgba(0, 0, 0, 0.7)",
  });
  try {
    if (platform === "OB") {
      const pc = await fetchObDemoUrl();
      if (pc)
        confirmAndOpenGame(platform, pc);
      return;
    }
    const gameId = CREDIT_V4_GAME_IDS[platform];
    if (gameId) {
      const v4User = await resolveCreditPlateUserName();
      const url = await fetchV4PlayUrl(v4User, gameId);
      if (url)
        confirmAndOpenGame(platform, url);
    }
  }
  catch (e) {
    const msg = e instanceof Error ? e.message : "进入游戏失败";
    ElMessage.error(msg);
  }
  finally {
    await sleep(1000);
    loading.close();
  }
}

/** 顺序对齐 A8 `UserCollectView`：PB → TF → IM → OB → SABA */
export const CREDIT_PLATE_ENTRIES: { id: PlatformId; label: string }[] = [
  { id: "PB", label: "平博体育" },
  { id: "TF", label: "雷火试玩" },
  { id: "IM", label: "IM试玩" },
  { id: "OB", label: "OB试玩" },
  { id: "SABA", label: "SABA试玩" },
];
