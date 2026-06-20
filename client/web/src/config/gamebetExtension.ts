/** Telegram 机器人引导链接 */
export const TELEGRAM_BOT_URL = "https://t.me/j4o_bot";
export const TELEGRAM_BOT_NAME = "@j4o_bot";

/** gamebetplug 固定扩展 ID（与 gamebetplug/manifest.json 中公钥对应） */
export const GAMEBET_EXTENSION_ID_DEFAULT = "mogfpjihgoghabicofkbcmcidlcoofee";

/** 优先读构建环境变量，便于临时覆盖；未设置则用 gamebetplug 默认 ID */
export function gamebetExtensionId(): string {
  const fromEnv = import.meta.env.VITE_GAMEBET_EXTENSION_ID;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim();
  }
  return GAMEBET_EXTENSION_ID_DEFAULT;
}

/**
 * DEV 本地联调：跳过扩展探测，Gate 直接出登录框；采集/下注仍依赖真实扩展。
 * DEV 默认跳过；设 VITE_SKIP_EXTENSION_GATE=0 恢复强制检测。
 */
export function skipExtensionGate(): boolean {
  if (!import.meta.env.DEV) return false;
  const flag = import.meta.env.VITE_SKIP_EXTENSION_GATE;
  if (flag === "0" || flag === "false") return false;
  return true;
}

/** 登录页 / 采集报错时展示的安装说明 */
export function gamebetExtensionInstallHint(): string {
  const id = gamebetExtensionId();
  return (
    `请先在 Chrome 或 Edge 打开 chrome://extensions，开启「开发者模式」，` +
    `选择「加载已解压的扩展程序」并指向仓库中的 changmen/client/chrome-extension 目录。` +
    `扩展 ID 应为 ${id}。安装并启用后刷新本页再登录。`
  );
}

export function expectedGamebetExtensionId(): string {
  return gamebetExtensionId() || GAMEBET_EXTENSION_ID_DEFAULT;
}
