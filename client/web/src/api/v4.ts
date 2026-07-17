import type { PlatformId } from "@/types/esport";
import { ElLoading, ElMessage, ElMessageBox } from "element-plus";

/** @deprecated v4 信用盘已停用；保留常量以免旧引用炸编译 */
export const CREDIT_PLATE_PASSWORD = "a123456";
export const CREDIT_PLATE_USER = "TJ01";
export const CREDIT_FORWARD_SITE = "";
export const CREDIT_PB_GAME_ID = 3;
export const CREDIT_TF_GAME_ID = 5;
export const CREDIT_IM_GAME_ID = 9;

/** 对齐 A8 bundle `gY`：浏览器直连 OB 试玩登录（非 api.a8.to） */
export const OB_DEMO_LOGIN_URL
  = "https://djtop-capi.v662n.com/cApi/v2/member/login?merchant=6107384714184464&demo=1";
export const SABA_DEMO_URL
  = "https://www.sabab2b.com/zh-CN/freetrial/demo?platform=Mobile&site=liteDemo&skin=7";

interface ObDemoResponse {
  status?: boolean | number | string;
  message?: string;
  data?: { pc?: string };
}

const V4_DISABLED_MSG = "信用盘 v4 已停用（不再使用 api.a8.to）";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 对齐 bundle `Lc.confirm(…).then(() => window.open(…))` */
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

function enterSabaDemo(): void {
  window.open(SABA_DEMO_URL, "SABA");
}

/**
 * 信用盘入口：
 * - OB / SABA：官方试玩（不经 api.a8.to）
 * - PB / TF / IM：v4 已停用
 */
export async function enterCreditPlate(platform: PlatformId): Promise<void> {
  if (platform === "SABA") {
    enterSabaDemo();
    return;
  }

  if (platform === "PB" || platform === "TF" || platform === "IM") {
    ElMessage.warning(V4_DISABLED_MSG);
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
    ElMessage.warning(V4_DISABLED_MSG);
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

/** 仅保留不依赖 api.a8.to 的试玩入口 */
export const CREDIT_PLATE_ENTRIES: { id: PlatformId; label: string }[] = [
  { id: "OB", label: "OB试玩" },
  { id: "SABA", label: "SABA试玩" },
];
