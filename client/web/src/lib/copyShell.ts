/**
 * 运行时皮肤：legacy（Vite 打包 a8.css）↔ modules（EP 官方主题 + changmen 自有样式）。
 * DEV 默认 modules；生产默认 legacy，右下角可切换，modules 失败自动回退 legacy。
 */

export const COPY_A8_STORAGE_KEY = "copy:useA8Css";

export type SkinMode = "legacy" | "modules";

/** modules：EP 官方 theme-chalk（bootstrap-ep-chalk.mjs 同步） */
export const COPY_EP_CHALK_HREF = "/copy/styles/modules/changmen/ep-chalk.css";

/** public/copy legacy 整包（DEV legacy 对照；与 src/styles 同步） */
export const COPY_LEGACY_STYLES = [
  "/copy/styles/legacy/a8.css",
  "/copy/styles/legacy/login-carousel.css",
  "/copy/styles/legacy/a8-fallback.css",
  "/copy/styles/legacy/a8-am-icon.css",
  "/copy/styles/legacy/a8-icon-fallback.css",
  "/copy/styles/legacy/user-diag.css",
  "/copy/styles/legacy/app.css",
  "/copy/styles/legacy/admin-theme.css",
] as const;

/** changmen 补丁层（仅 modules；legacy 勿加载） */
export const COPY_CHANGMEN_MODULE_STYLES = [
  "/copy/styles/modules/changmen/login-carousel.css",
  "/copy/styles/modules/changmen/tokens.css",
  "/copy/styles/modules/changmen/layout.css",
  "/copy/styles/modules/changmen/misc.css",
  "/copy/styles/modules/changmen/ep-fallback.css",
  "/copy/styles/modules/changmen/am-icon.css",
  "/copy/styles/modules/changmen/platform-icons.css",
  "/copy/styles/modules/changmen/icon-fallback.css",
  "/copy/styles/modules/changmen/user-diag.css",
  "/copy/styles/modules/changmen/app.css",
  "/copy/styles/modules/changmen/account-bar.css",
  "/copy/styles/modules/changmen/match-list.css",
  "/copy/styles/modules/changmen/bet-row.css",
  "/copy/styles/modules/changmen/sidebar-user.css",
  "/copy/styles/modules/changmen/extension-banner.css",
  "/copy/styles/modules/changmen/admin-theme.css",
  "/copy/styles/modules/changmen/sidebar-orders.css",
] as const;

export function isDevSkinLab(): boolean {
  return import.meta.env.DEV;
}

/** 右下角皮肤切换角标（生产默认可用；设 VITE_HIDE_SKIN_BANNER=1 可隐藏） */
export function showSkinBanner(): boolean {
  return import.meta.env.VITE_HIDE_SKIN_BANNER !== "1";
}

/** @deprecated 使用 showSkinBanner */
export function showDevSkinBanner(): boolean {
  return showSkinBanner();
}

function defaultUseLegacyBundle(): boolean {
  return import.meta.env.PROD;
}

/**
 * URL ?a8=0|1 优先，否则 localStorage。
 * true = legacy（Vite bundle）；false = modules。
 */
export function getUseA8Css(): boolean {
  const param = new URLSearchParams(location.search).get("a8");
  if (param === "0") return false;
  if (param === "1") return true;
  const stored = localStorage.getItem(COPY_A8_STORAGE_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return defaultUseLegacyBundle();
}

export function getSkinMode(): SkinMode {
  return getUseA8Css() ? "legacy" : "modules";
}

/** 切换后整页刷新以重建样式栈 */
export function setUseA8Css(use: boolean): void {
  localStorage.setItem(COPY_A8_STORAGE_KEY, use ? "1" : "0");
  const u = new URL(location.href);
  u.searchParams.delete("a8");
  location.href = `${u.pathname}${u.search}${u.hash}`;
}

const MODULE_SKIN_HREFS = new Set<string>([COPY_EP_CHALK_HREF, ...COPY_CHANGMEN_MODULE_STYLES]);

const LEGACY_VITE_STYLE_MARKERS = [
  "/styles/a8.css",
  "/styles/login-carousel.css",
  "/styles/a8-fallback.css",
  "/styles/a8-am-icon.css",
  "/styles/a8-icon-fallback.css",
  "/styles/user-diag.css",
  "/styles/app.css",
  "/styles/admin-theme.css",
] as const;

function loadStylesheet(href: string): Promise<void> {
  if (document.querySelector(`link[data-copy-shell][href="${href}"]`)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.copyShell = "1";
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`[copyShell] failed to load ${href}`));
    document.head.appendChild(link);
  });
}

/** 去掉 modules 注入的 <link>（legacy 或 fallback 前调用） */
function removeModuleSkinLinkTags(): void {
  document.querySelectorAll("link[data-copy-shell]").forEach((node) => {
    const href = node.getAttribute("href");
    if (href && MODULE_SKIN_HREFS.has(href)) node.remove();
  });
}

/** DEV：去掉 legacy 动态 import 注入的 <style>（切 modules 前调用） */
function removeLegacyViteStyleTags(): void {
  if (!import.meta.env.DEV) return;
  document.querySelectorAll("style[data-vite-dev-id]").forEach((node) => {
    const id = node.getAttribute("data-vite-dev-id") ?? "";
    if (LEGACY_VITE_STYLE_MARKERS.some((m) => id.includes(m))) node.remove();
  });
}

/** modules：EP 官方主题 → changmen 补丁（不加载 A8 extract） */
async function loadModuleSkinStyles(): Promise<void> {
  await loadStylesheet(COPY_EP_CHALK_HREF);
  for (const href of COPY_CHANGMEN_MODULE_STYLES) {
    await loadStylesheet(href);
  }
}

async function loadAppStyles(): Promise<void> {
  /** legacy 对照栈：保持 A8 bundle，不引入 changmen 补丁 */
  await Promise.all([
    import("@/styles/a8.css"),
    import("@/styles/login-carousel.css"),
    import("@/styles/a8-fallback.css"),
    import("@/styles/a8-am-icon.css"),
    import("@/styles/a8-icon-fallback.css"),
    import("@/styles/user-diag.css"),
    import("@/styles/app.css"),
    import("@/styles/admin-theme.css"),
  ]);
}

export async function loadStylesForBootstrap(): Promise<void> {
  const useLegacy = getUseA8Css();
  if (import.meta.env.DEV) {
    console.info(`[copyShell] bootstrap skin=${useLegacy ? "legacy" : "modules"}`);
  }

  if (!useLegacy) {
    removeLegacyViteStyleTags();
    try {
      await loadModuleSkinStyles();
    } catch (err) {
      console.error("[copyShell] modules skin failed, falling back to legacy bundle", err);
      removeModuleSkinLinkTags();
      localStorage.setItem(COPY_A8_STORAGE_KEY, "1");
      await loadAppStyles();
    }
  } else {
    removeModuleSkinLinkTags();
    await loadAppStyles();
  }

  if (showSkinBanner()) {
    try {
      await loadStylesheet("/copy/copy-chrome.css");
    } catch {
      /* 角标样式缺失不影响主界面 */
    }
  }
}
