/**
 * [changmen 扩展] web 侧套利运行时同步（Pinia / 全盘口观察接线）。
 * detect / state / types 请直连 @changmen/arb-core/opportunity/*。
 */
export {
  applyArbRuntimeState,
  type ArbRuntimeFlags,
  installArbRuntimeSync,
  resolveArbRuntimeFlags,
  stopArbRuntime,
  syncArbRuntime,
  teardownArbRuntimeSync,
} from "@/extensions/arbOpportunity/syncArbRuntime";
