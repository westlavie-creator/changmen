/**
 * 运行时皮肤：固定使用 modules（EP 官方主题 + changmen 自有样式）。
 */

/** modules：EP 官方 theme-chalk（bootstrap-ep-chalk.mjs 同步） */
export const COPY_EP_CHALK_HREF = "/copy/styles/modules/changmen/ep-chalk.css";

/** changmen 补丁层 */
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

export async function loadStylesForBootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    console.info("[copyShell] bootstrap skin=modules");
  }
  await loadStylesheet(COPY_EP_CHALK_HREF);
  for (const href of COPY_CHANGMEN_MODULE_STYLES) {
    await loadStylesheet(href);
  }
}
