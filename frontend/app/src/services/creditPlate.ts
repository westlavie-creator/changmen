import type { PlatformId } from "@/types/esport";

/** 对齐 A8 bundle UserCollectView：RMe / FMe / WMe / uY */
export const CREDIT_PLATE_PASSWORD = "a123456";
export const CREDIT_FORWARD_SITE = "game.haijings.vip";
export const CREDIT_PB_GAME_ID = 3;
export const OB_DEMO_LOGIN_URL =
  "https://djtop-capi.v662n.com/cApi/v2/member/login?merchant=6107384714184464&demo=1";
export const SABA_DEMO_URL =
  "https://www.sabab2b.com/zh-CN/freetrial/demo?platform=Mobile&site=liteDemo&skin=7";

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

function v4BaseUrl(): string {
  return location.hostname === "localhost" ? "https://api.a8.to/v4.0/" : "/v4.0/";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function v4Post<T>(
  path: string,
  body: Record<string, string | number>,
  token?: string,
): Promise<V4Envelope<T>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.set(key, String(value));
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded;",
    "x-forwarded-site": CREDIT_FORWARD_SITE,
  };
  if (token) headers.token = token;

  const res = await fetch(`${v4BaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: params.toString(),
  });
  return (await res.json()) as V4Envelope<T>;
}

function confirmEnter(platform: PlatformId): boolean {
  return window.confirm(`确认要进入${platform}吗？`);
}

async function enterPbSports(userName: string): Promise<void> {
  const login = await v4Post<{ token?: string }>("user/account/login", {
    userName,
    password: CREDIT_PLATE_PASSWORD,
  });
  if (login.success !== 1) {
    window.alert(login.msg || "登录失败");
    return;
  }
  const token = login.info?.token;
  if (!token) {
    window.alert("登录失败：未返回 token");
    return;
  }

  const play = await v4Post<{ Url?: string }>("game/play/Login", {
    gameId: CREDIT_PB_GAME_ID,
  }, token);
  if (play.success !== 1) {
    window.alert(play.msg || "进入游戏失败");
    return;
  }
  const url = play.info?.Url;
  if (!url) {
    window.alert("进入游戏失败：未返回 URL");
    return;
  }
  if (confirmEnter("PB")) {
    window.open(url, "PB");
  }
}

async function enterObDemo(): Promise<void> {
  const res = await fetch(OB_DEMO_LOGIN_URL);
  const body = (await res.json()) as ObDemoResponse;
  if (!body.status) {
    window.alert(body.message || "OB 试玩登录失败");
    return;
  }
  const pc = body.data?.pc;
  if (!pc) {
    window.alert("OB 试玩登录失败：未返回 pc 地址");
    return;
  }
  if (confirmEnter("OB")) {
    window.open(pc, "OB");
  }
}

function enterSabaDemo(): void {
  window.open(SABA_DEMO_URL, "SABA");
}

/** 对齐 bundle `l(d)`：PB / OB / SABA 信用盘入口 */
export async function enterCreditPlate(
  platform: PlatformId,
  userName: string,
): Promise<void> {
  if (platform === "SABA") {
    enterSabaDemo();
    return;
  }

  try {
    if (platform === "OB") {
      await enterObDemo();
      return;
    }
    if (platform === "PB") {
      await enterPbSports(userName);
    }
  } finally {
    await sleep(1000);
  }
}

export const CREDIT_PLATE_ENTRIES: { id: PlatformId; label: string }[] = [
  { id: "PB", label: "平博体育" },
  { id: "OB", label: "OB试玩" },
  { id: "SABA", label: "SABA试玩" },
];
