/**
 * 运行时皮肤：legacy（Vite 打包 a8.css）↔ modules（/copy/styles/modules）。
 * DEV 默认 modules；生产默认 legacy，右下角可切换，modules 失败自动回退 legacy。
 */

export const COPY_A8_STORAGE_KEY = "copy:useA8Css";

export const COPY_A8_MODULE_HREF = "/copy/styles/modules/a8-all.css";
export const COPY_MODULE_SEGMENTS_MANIFEST = "/copy/styles/modules/segments/manifest.json";

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

/** changmen 补丁层（modules 皮肤；sync 自 src/styles；顺序与 main.ts 一致） */
export const COPY_CHANGMEN_MODULE_STYLES = [
  "/copy/styles/modules/changmen/login-carousel.css",
  "/copy/styles/modules/changmen/ep-fallback.css",
  "/copy/styles/modules/changmen/am-icon.css",
  "/copy/styles/modules/changmen/icon-fallback.css",
  "/copy/styles/modules/changmen/user-diag.css",
  "/copy/styles/modules/changmen/app.css",
  "/copy/styles/modules/changmen/admin-theme.css",
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
 * 未设置时：生产默认 legacy，DEV 默认 modules。
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

/** 切换后整页刷新以重建样式栈 */
export function setUseA8Css(use: boolean): void {
  localStorage.setItem(COPY_A8_STORAGE_KEY, use ? "1" : "0");
  const u = new URL(location.href);
  u.searchParams.delete("a8");
  location.href = `${u.pathname}${u.search}${u.hash}`;
}

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

async function loadModuleSkinSegments(): Promise<"segments" | "fallback"> {
  try {
    const res = await fetch(COPY_MODULE_SEGMENTS_MANIFEST);
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { files?: string[] };
    if (!Array.isArray(data.files) || !data.files.length) throw new Error("empty manifest");
    for (const href of data.files) {
      await loadStylesheet(href);
    }
    return "segments";
  } catch {
    await loadStylesheet(COPY_A8_MODULE_HREF);
    return "fallback";
  }
}

/** modules：生产用 a8-all 单文件；DEV 优先 segments */
async function loadModuleSkinStyles(): Promise<void> {
  if (import.meta.env.PROD) {
    await loadStylesheet(COPY_A8_MODULE_HREF);
  } else {
    await loadModuleSkinSegments();
  }
  for (const href of COPY_CHANGMEN_MODULE_STYLES) {
    await loadStylesheet(href);
  }
}

async function loadAppStyles(): Promise<void> {
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

  if (!useLegacy) {
    try {
      await loadModuleSkinStyles();
    } catch (err) {
      console.error("[copyShell] modules skin failed, falling back to legacy bundle", err);
      localStorage.setItem(COPY_A8_STORAGE_KEY, "1");
      await loadAppStyles();
    }
  } else {
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
