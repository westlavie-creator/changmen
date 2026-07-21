import type { UiTheme } from "@/types/extensionPrefs";
import { isLightUiTheme, normalizeUiTheme, UI_THEMES } from "@/types/extensionPrefs";

const THEME_CLASSES = UI_THEMES
  .filter(t => t !== "default")
  .map(t => `ui-theme-${t}`);

/**
 * 在 documentElement 挂皮肤标记。
 * 浅色皮（brutal / paper）：去掉 html.dark；
 * 终端风：补上 dark；
 * 默认：非管理后台去掉 dark，管理后台恢复 dark。
 */
export function applyUiTheme(raw: unknown): UiTheme {
  const theme = normalizeUiTheme(raw);
  const root = document.documentElement;

  for (const cls of THEME_CLASSES)
    root.classList.remove(cls);

  if (theme === "default") {
    root.removeAttribute("data-ui-theme");
    if (root.classList.contains("admin-route"))
      root.classList.add("dark");
    else
      root.classList.remove("dark");
    return theme;
  }

  root.setAttribute("data-ui-theme", theme);
  root.classList.add(`ui-theme-${theme}`);

  if (isLightUiTheme(theme))
    root.classList.remove("dark");
  else
    root.classList.add("dark");

  return theme;
}
