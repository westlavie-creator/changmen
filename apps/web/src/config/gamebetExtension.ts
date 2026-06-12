/** Telegram 机器人引导链接 */
export const TELEGRAM_BOT_URL = "https://t.me/esportfight_bot";
export const TELEGRAM_BOT_NAME = "@esportfight_bot";

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

/** 登录页 / 采集报错时展示的安装说明 */
export function gamebetExtensionInstallHint(): string {
  const id = gamebetExtensionId();
  return (
    `请先在 Chrome 或 Edge 打开 chrome://extensions，开启「开发者模式」，` +
    `选择「加载已解压的扩展程序」并指向仓库中的 changmen/apps/chrome-extension 目录。` +
    `扩展 ID 应为 ${id}。安装并启用后刷新本页再登录。`
  );
}
