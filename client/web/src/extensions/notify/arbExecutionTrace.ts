/** @deprecated 请从 `@/stores/betting/autoBet/arbExecutionTrace` 引用；本文件仅保留兼容转发 */
export {
  createArbExecutionTrace,
  type ArbExecutionTrace,
  type ArbProgressEvent,
  type ArbProgressOutcome,
  type ArbProgressPayload,
} from "@/stores/betting/autoBet/arbExecutionTrace";

export { formatArbProgressTelegramBody } from "@/extensions/notify/formatArbProgress";
