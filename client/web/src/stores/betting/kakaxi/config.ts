/** kakaxi 调度参数（仅 kakaxi 模式；A8 路径不读取） */

export const KAKAXI_DETECT_DEBOUNCE_MS = 80;
export const KAKAXI_DETECT_FALLBACK_MS = 5_000;

/** implied 上升超过此值视为 improved，用于提升队列优先级 */
export const KAKAXI_IMPROVED_EPSILON = 0.002;

/** 队列条目最长存活时间（ms），超时出队丢弃 */
export const KAKAXI_QUEUE_TTL_MS = 30_000;

/** 预检失败或机会消失后的再入队冷却（ms） */
export const KAKAXI_BET_COOLDOWN_MS = 2_000;

/** 主循环每轮最多 drain 条数（避免挡住 makeUp） */
export const KAKAXI_DRAIN_MAX_BETS = 5;

/** 主循环每轮 drain 最长耗时（ms） */
export const KAKAXI_DRAIN_MAX_MS = 400;

/** wake 路径 drain 预算（抢 live 首单，更小以免挡主循环补单） */
export const KAKAXI_WAKE_DRAIN_MAX_BETS = 2;
export const KAKAXI_WAKE_DRAIN_MAX_MS = 200;

/** 同一 drain 波次内最多并行 execute 条数（按 platform 互斥扩容） */
export const KAKAXI_MAX_PARALLEL_EXECUTES = 4;

/** detect 入队后非 live 唤醒 drain 的合并窗口（ms）；live 为 0 */
export const KAKAXI_DRAIN_WAKE_DEBOUNCE_MS = 16;
