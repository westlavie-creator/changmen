import type { UiTheme } from "@/types/extensionPrefs";
import { normalizeUiTheme } from "@/types/extensionPrefs";

const BRUTAL_CLASS = "ui-theme-brutal";

/**
 * 在 documentElement 挂皮肤标记。
 * brutal 为浅色皮：临时去掉 html.dark，避免 EP 深色变量压过；离开时若仍在管理后台则恢复 dark。
 */
export function applyUiTheme(raw: unknown): UiTheme {
  const theme = normalizeUiTheme(raw);
  const root = document.documentElement;

  if (theme === "default") {
    root.removeAttribute("data-ui-theme");
    root.classList.remove(BRUTAL_CLASS);
    if (root.classList.contains("admin-route"))
      root.classList.add("dark");
    return theme;
  }

  root.setAttribute("data-ui-theme", theme);
  root.classList.add(BRUTAL_CLASS);
  root.classList.remove("dark");
  return theme;
}
