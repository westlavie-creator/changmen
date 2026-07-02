/**
 * 运行时皮肤：固定使用 assets/styles（EP 官方主题 + changmen 自有样式）。
 */

/** EP 官方 theme-chalk（bootstrap-ep-chalk.mjs 同步） */
export const STYLE_EP_CHALK_HREF = "/assets/styles/changmen/ep-chalk.css";

/** changmen 补丁层 */
export const CHANGMEN_STYLE_HREFS = [
  "/assets/styles/changmen/login-carousel.css",
  "/assets/styles/changmen/tokens.css",
  "/assets/styles/changmen/layout.css",
  "/assets/styles/changmen/ep-fallback.css",
  "/assets/styles/changmen/am-icon.css",
  "/assets/styles/changmen/platform-icons.css",
  "/assets/styles/changmen/icon-fallback.css",
  "/assets/styles/changmen/user-diag.css",
  "/assets/styles/changmen/app.css",
  "/assets/styles/changmen/account-bar.css",
  "/assets/styles/changmen/match-list.css",
  "/assets/styles/changmen/bet-row.css",
  "/assets/styles/changmen/sidebar-user.css",
  "/assets/styles/changmen/extension-banner.css",
  "/assets/styles/changmen/admin-theme.css",
  "/assets/styles/changmen/sidebar-orders.css",
] as const;

export function isDevSkinLab(): boolean {
  return import.meta.env.DEV;
}

function loadStylesheet(href: string): Promise<void> {
  if (document.querySelector(`link[data-style-shell][href="${href}"]`)) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.styleShell = "1";
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`[styleShell] failed to load ${href}`));
    document.head.appendChild(link);
  });
}

export async function loadStylesForBootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    console.info("[styleShell] bootstrap skin=assets/styles");
  }
  await loadStylesheet(STYLE_EP_CHALK_HREF);
  for (const href of CHANGMEN_STYLE_HREFS) {
    await loadStylesheet(href);
  }
}
