/**
 * @deprecated 用 pbExtensionsLocal.ts（总开关，默认 A8）。
 */
import {
  readPbChangmenExtensionsLocal,
  writePbChangmenExtensionsLocal,
} from "./pbExtensionsLocal";

export const PB_LIVE_FO_ONLY_LOCAL_KEY = "changmen:pbLiveFoOnly";

/** @deprecated 语义：true = 仅 live 写 fo（= A8 = 扩展关） */
export function readPbLiveFoOnlyLocal(): boolean {
  return !readPbChangmenExtensionsLocal();
}

/** @deprecated 传 true = 仅 live = 扩展关 */
export function writePbLiveFoOnlyLocal(on: boolean): void {
  writePbChangmenExtensionsLocal(!on);
}
