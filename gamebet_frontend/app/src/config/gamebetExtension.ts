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
