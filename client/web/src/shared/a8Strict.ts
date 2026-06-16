/**
 * 严格 A8 模式：关闭 changmen 的所有增强项，确保除增强外行为/界面与 A8 一致。
 *
 * 开关优先级：
 * - localStorage `A8_STRICT=1|0`
 * - Vite env `VITE_A8_STRICT=1`
 */
export function isA8StrictMode(): boolean {
  try {
    const raw = localStorage.getItem("A8_STRICT");
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // ignore
  }
  return String(import.meta.env.VITE_A8_STRICT ?? "") === "1";
}

