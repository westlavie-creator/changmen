<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import { getAdminOrderLogs } from "@/api/admin";
import type {
  AdminOrderLogAttempt,
  AdminOrderLogEntry,
  AdminOrderLogLegSection,
  AdminOrderLogLookup,
  AdminOrderRow,
} from "@/types/admin";
import { formatLinkId } from "@/shared/format";
import { attemptLogSegments } from "@/shared/adminOrderLogSegments";

const ARB_LINK_MIN = 1_000_000_000_000;

const visible = ref(false);
const loading = ref(false);
const error = ref("");
const data = ref<AdminOrderLogLookup | null>(null);
const title = ref("下单诊断");

const kindLabel: Record<string, string> = {
  check: "预检",
  bet: "下注",
  reject: "拒单",
  other: "其他",
};

function fmtTime(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function kindClass(kind: string) {
  if (kind === "bet") return "admin-order-log-kind--bet";
  if (kind === "check") return "admin-order-log-kind--check";
  if (kind === "reject") return "admin-order-log-kind--reject";
  return "";
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "win") return "admin-badge--win";
  if (s === "lose") return "admin-badge--lose";
  if (s === "reject") return "admin-badge--reject";
  if (s === "pending") return "admin-badge--pending";
  return "";
}

function pnlClass(money: number) {
  if (money > 0) return "pos";
  if (money < 0) return "neg";
  return "";
}

function isArbLookup(payload: AdminOrderLogLookup) {
  if (payload.linkType === "套利" || payload.groupLabel.includes("套利")) return true;
  const orders = payload.orders || [];
  return orders.length > 1 && orders.every((o) => Number(o.link) >= ARB_LINK_MIN);
}

function assignOrphanLogs(attempts: AdminOrderLogAttempt[], orphanLogs: AdminOrderLogEntry[]) {
  if (!orphanLogs.length) return;
  if (!attempts.length) {
    attempts.push({ key: "orphan", order: null, logs: [...orphanLogs] });
    return;
  }
  for (const log of orphanLogs) {
    let best = attempts[0]!;
    let bestDist = Math.abs(log.createAt - (best.order?.createAt ?? log.createAt));
    for (const att of attempts.slice(1)) {
      const dist = Math.abs(log.createAt - (att.order?.createAt ?? 0));
      if (dist < bestDist) {
        bestDist = dist;
        best = att;
      }
    }
    best.logs.push(log);
  }
}

function inferTargetFromLogs(logs: AdminOrderLogEntry[]) {
  for (const log of logs) {
    if (log.target === "Home" || log.target === "Away") return log.target;
  }
  for (const log of logs) {
    const m = String(log.summary || "").match(/\s(Home|Away)@/);
    if (m) return m[1] as "Home" | "Away";
  }
  return null;
}

function sideLabel(leg: AdminOrderLogLegSection) {
  return leg.side === "Away" ? "客队" : "主队";
}

function attemptProvider(attempt: AdminOrderLogAttempt) {
  return attempt.order?.provider ?? null;
}

function touchLegProvider(leg: AdminOrderLogLegSection, provider: string | null | undefined) {
  if (!provider) return;
  if (!leg.provider) {
    leg.provider = provider;
    return;
  }
  if (leg.provider.includes(provider)) return;
  leg.provider = `${leg.provider}/${provider}`;
}

function pickLegIndexForUnassigned(legs: AdminOrderLogLegSection[]) {
  const homeN = legs[0]!.attempts.length;
  const awayN = legs[1]!.attempts.length;
  if (homeN && !awayN) return 1;
  if (!homeN && awayN) return 0;
  return homeN <= awayN ? 0 : 1;
}

function resolveLegIndexByProvider(provider: string | null | undefined, legs: AdminOrderLogLegSection[]) {
  if (!provider) return pickLegIndexForUnassigned(legs);
  for (let i = 0; i < 2; i++) {
    if (legs[i]!.provider === provider || legs[i]!.provider?.includes(provider)) return i;
    for (const att of legs[i]!.attempts) {
      if (att.order?.provider === provider) return i;
    }
  }
  return pickLegIndexForUnassigned(legs);
}

/** 旧后端无 legSections 时前端兜底（主客队） */
function fallbackLegSections(payload: AdminOrderLogLookup): AdminOrderLogLegSection[] {
  const sortedOrders = [...payload.orders].sort((a, b) => a.createAt - b.createAt);
  const sortedLogs = [...payload.logs].sort((a, b) => a.createAt - b.createAt);
  const isArb = isArbLookup(payload);

  const legs: AdminOrderLogLegSection[] = [
    { key: "leg-home", legIndex: 0, side: "Home", label: "主队", provider: null, attempts: [] },
    { key: "leg-away", legIndex: 1, side: "Away", label: "客队", provider: null, attempts: [] },
  ];

  const attempts = sortedOrders.map((order) => ({
    key: order.orderId,
    order,
    logs: [] as AdminOrderLogEntry[],
  }));
  const attemptByOrderId = new Map(attempts.map((a) => [a.order.orderId, a]));
  const orphanLogs: AdminOrderLogEntry[] = [];

  for (const log of sortedLogs) {
    const orderId = log.orderId ? String(log.orderId) : null;
    if (orderId && attemptByOrderId.has(orderId)) {
      attemptByOrderId.get(orderId)!.logs.push(log);
    } else {
      orphanLogs.push(log);
    }
  }

  for (const att of attempts) {
    att.logs.sort((a, b) => a.createAt - b.createAt);
    const side = inferTargetFromLogs(att.logs);
    const legIdx =
      side === "Away" ? 1 : side === "Home" ? 0 : pickLegIndexForUnassigned(legs);
    legs[legIdx]!.attempts.push(att);
    touchLegProvider(legs[legIdx]!, att.order.provider);
  }

  for (const leg of legs) {
    leg.attempts.sort((a, b) => (a.order?.createAt ?? 0) - (b.order?.createAt ?? 0));
  }

  const orphanBySide: { Home: AdminOrderLogEntry[]; Away: AdminOrderLogEntry[]; unknown: AdminOrderLogEntry[] } = {
    Home: [],
    Away: [],
    unknown: [],
  };
  for (const log of orphanLogs) {
    const side =
      log.target === "Home" || log.target === "Away"
        ? log.target
        : (String(log.summary || "").match(/\s(Home|Away)@/)?.[1] as "Home" | "Away" | undefined);
    if (side === "Home") orphanBySide.Home.push(log);
    else if (side === "Away") orphanBySide.Away.push(log);
    else orphanBySide.unknown.push(log);
  }

  assignOrphanLogs(legs[0]!.attempts, orphanBySide.Home);
  assignOrphanLogs(legs[1]!.attempts, orphanBySide.Away);
  for (const log of orphanBySide.unknown) {
    const idx = resolveLegIndexByProvider(log.provider, legs);
    assignOrphanLogs(legs[idx]!.attempts, [log]);
    touchLegProvider(legs[idx]!, log.provider);
  }

  for (const leg of legs) {
    leg.label = sideLabel(leg);
  }

  if (isArb) return legs;
  return legs.filter((leg) => leg.attempts.some((a) => a.order || a.logs.length > 0));
}

const legColumns = computed(() => {
  if (!data.value) return [];
  if (data.value.legSections?.length) return data.value.legSections;
  return fallbackLegSections(data.value);
});

const dialogWidth = computed(() => {
  const n = legColumns.value.length;
  if (n <= 2) return "min(980px, 98vw)";
  return `min(${720 + n * 240}px, 98vw)`;
});

const legColumnsStyle = computed(() => ({
  "--order-log-cols": String(Math.max(legColumns.value.length, 1)),
}));

const sortedOrders = computed(() => {
  if (!data.value?.orders.length) return [];
  return [...data.value.orders].sort((a, b) => a.createAt - b.createAt);
});

const overviewMatch = computed(() => {
  const matches = sortedOrders.value.map((o) => o.match).filter(Boolean);
  if (!matches.length) return "";
  const first = matches[0];
  return matches.every((m) => m === first) ? first : matches[0];
});

const totalProfit = computed(() =>
  sortedOrders.value.reduce((sum, o) => sum + (Number(o.money) || 0), 0),
);

const platformLabels = computed(() => {
  const labels = new Set<string>();
  for (const o of sortedOrders.value) {
    if (o.provider) labels.add(o.provider);
  }
  return [...labels].join(" · ");
});

function attemptDividerLabel(prev: AdminOrderLogAttempt, next: AdminOrderLogAttempt) {
  if (prev.order?.status?.toLowerCase() === "reject") return "拒单后重下";
  if (!prev.order && next.order) return "再次下单";
  return "再次下单";
}

function legOrderAttempts(leg: AdminOrderLogLegSection) {
  return leg.attempts.filter((a) => a.order);
}

function legProfit(leg: AdminOrderLogLegSection) {
  return leg.attempts.reduce((sum, a) => sum + (Number(a.order?.money) || 0), 0);
}

const hasOverviewOrders = computed(() => sortedOrders.value.length > 0);

async function open(rows: AdminOrderRow[]) {
  if (!rows.length) return;
  const head = rows[0]!;
  visible.value = true;
  loading.value = true;
  error.value = "";
  data.value = null;
  title.value = `下单诊断 · ${formatLinkId(head.linkId)}`;
  try {
    data.value = await getAdminOrderLogs({
      userId: head.userId,
      linkId: head.linkId || undefined,
      orderId: rows.length === 1 && !head.linkId ? head.orderId : undefined,
    });
  } catch (e) {
    error.value = (e as Error).message || "加载失败";
    ElMessage.error(error.value);
  } finally {
    loading.value = false;
  }
}

function close() {
  visible.value = false;
}

defineExpose({ open });
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="dialogWidth"
    class="admin-order-log-dialog admin-dialog"
    append-to-body
    destroy-on-close
    @closed="close"
  >
    <div v-loading="loading" class="admin-order-log-dialog__scroll">
      <div class="admin-order-log-dialog__body">
        <p v-if="error" class="admin-order-log-dialog__err">{{ error }}</p>
        <template v-else-if="data">
          <div class="admin-order-log-layout">
            <section class="admin-order-log-overview">
              <div class="admin-order-log-overview__head">
                <div class="admin-order-log-overview__primary">
                  <span class="admin-order-log-overview__user">{{ data.user.userName }}</span>
                  <span class="admin-order-log-overview__link">{{ formatLinkId(data.link) }}</span>
                  <span class="admin-order-log-overview__tag">{{ data.linkType }}</span>
                  <span class="admin-order-log-overview__tag admin-order-log-overview__tag--muted">{{
                    data.groupLabel
                  }}</span>
                </div>
                <div class="admin-order-log-overview__window">
                  日志窗口 {{ fmtTime(data.logWindow.fromMs) }} — {{ fmtTime(data.logWindow.toMs) }}
                </div>
              </div>

              <div class="admin-order-log-overview__stats">
                <div class="admin-order-log-stat">
                  <span class="admin-order-log-stat__label">平台</span>
                  <span class="admin-order-log-stat__value">{{ platformLabels || "—" }}</span>
                </div>
                <div class="admin-order-log-stat">
                  <span class="admin-order-log-stat__label">订单</span>
                  <span class="admin-order-log-stat__value">{{ sortedOrders.length }} 笔</span>
                </div>
                <div class="admin-order-log-stat">
                  <span class="admin-order-log-stat__label">日志</span>
                  <span class="admin-order-log-stat__value">{{ data.logs.length }} 条</span>
                </div>
                <div v-if="overviewMatch" class="admin-order-log-stat admin-order-log-stat--wide">
                  <span class="admin-order-log-stat__label">比赛</span>
                  <span class="admin-order-log-stat__value">{{ overviewMatch }}</span>
                </div>
                <div
                  v-if="sortedOrders.length"
                  class="admin-order-log-stat"
                  :class="{
                    'admin-order-log-stat--pnl-pos': totalProfit > 0,
                    'admin-order-log-stat--pnl-neg': totalProfit < 0,
                  }"
                >
                  <span class="admin-order-log-stat__label">Link 盈亏</span>
                  <span class="admin-order-log-stat__value">¥{{ fmtMoney(totalProfit) }}</span>
                </div>
              </div>

              <div v-if="legColumns.length" class="admin-order-log-overview__orders">
                <h5 class="admin-order-log-overview__orders-title">订单概况</h5>
                <div class="admin-order-log-platforms" :style="legColumnsStyle">
                  <section
                    v-for="leg in legColumns"
                    :key="`overview-${leg.key}`"
                    class="admin-order-log-platform-col admin-order-log-overview-leg"
                  >
                    <header class="admin-order-log-leg-col__head">
                      <span class="admin-order-log-leg-col__name">{{ sideLabel(leg) }}</span>
                      <span
                        v-if="legOrderAttempts(leg).length"
                        class="admin-order-log-overview-leg__pnl"
                        :class="{
                          pos: legProfit(leg) > 0,
                          neg: legProfit(leg) < 0,
                        }"
                      >
                        盈亏 ¥{{ fmtMoney(legProfit(leg)) }}
                      </span>
                    </header>

                    <template v-if="legOrderAttempts(leg).length">
                      <div
                        v-for="(attempt, attemptIdx) in legOrderAttempts(leg)"
                        :key="`overview-${attempt.key}`"
                        class="admin-order-log-overview-order"
                      >
                        <div
                          v-if="attemptIdx > 0"
                          class="admin-order-log-attempt-divider"
                          :data-label="
                            attemptDividerLabel(legOrderAttempts(leg)[attemptIdx - 1]!, attempt)
                          "
                        />

                        <div class="admin-order-log-overview-order__row">
                          <span class="admin-order-log-attempt__index">第 {{ attemptIdx + 1 }} 笔</span>
                          <span
                            class="admin-badge"
                            :class="statusBadgeClass(attempt.order!.status)"
                          >
                            {{ attempt.order!.status }}
                          </span>
                          <span v-if="attempt.order!.provider" class="admin-order-provider">{{
                            attempt.order!.provider
                          }}</span>
                        </div>
                        <div
                          v-if="attempt.order!.match"
                          class="admin-order-log-overview-order__match"
                        >
                          {{ attempt.order!.match }}
                        </div>
                        <div class="admin-order-log-overview-order__bet">
                          {{ attempt.order!.item || attempt.order!.bet }} @ {{ attempt.order!.odds }}
                        </div>
                        <div class="admin-order-log-overview-order__meta">
                          <span>¥{{ fmtMoney(attempt.order!.betMoney) }}</span>
                          <span
                            :class="pnlClass(attempt.order!.money)"
                          >
                            {{ attempt.order!.money ? `盈亏 ¥${fmtMoney(attempt.order!.money)}` : "—" }}
                          </span>
                          <span class="admin-order-log-order-col__oid">#{{ attempt.order!.orderId }}</span>
                          <span class="admin-order-log-overview-order__time">{{
                            fmtTime(attempt.order!.createAt)
                          }}</span>
                        </div>
                      </div>
                    </template>
                    <p v-else class="admin-order-log-overview__empty">{{ sideLabel(leg) }}无落库订单</p>
                  </section>
                </div>
              </div>
              <p v-else-if="!hasOverviewOrders" class="admin-order-log-overview__empty">该 Link 无落库订单</p>
            </section>

            <section class="admin-order-log-logs-row">
              <header class="admin-order-log-logs-row__head">
                <h4 class="admin-order-log-logs-row__title">主客队诊断日志</h4>
                <span class="admin-order-log-logs-row__hint">主队 / 客队；同侧拒单重下以分隔线区分；补单按预检轮次分账号</span>
              </header>

              <div
                v-if="legColumns.length"
                class="admin-order-log-platforms"
                :style="legColumnsStyle"
              >
                <section
                  v-for="leg in legColumns"
                  :key="leg.key"
                  class="admin-order-log-platform-col admin-order-log-leg-col"
                >
                  <header class="admin-order-log-leg-col__head">
                    <span class="admin-order-log-leg-col__name">{{ sideLabel(leg) }}</span>
                    <span class="admin-order-log-platform-col__counts">
                      {{ leg.attempts.length }} 段 ·
                      {{ leg.attempts.reduce((n, a) => n + a.logs.length, 0) }} 条日志
                    </span>
                  </header>

                  <template v-if="leg.attempts.length">
                    <div
                      v-for="(attempt, attemptIdx) in leg.attempts"
                      :key="attempt.key"
                      class="admin-order-log-attempt"
                    >
                      <div
                        v-if="attemptIdx > 0"
                        class="admin-order-log-attempt-divider"
                        :data-label="attemptDividerLabel(leg.attempts[attemptIdx - 1]!, attempt)"
                      />

                      <div class="admin-order-log-attempt__head">
                        <div class="admin-order-log-order-col__title">
                          <span v-if="attempt.order" class="admin-order-log-attempt__index">
                            第 {{ attemptIdx + 1 }} 笔
                          </span>
                          <span
                            v-if="attempt.order"
                            class="admin-badge admin-order-log-order-col__status"
                            :class="statusBadgeClass(attempt.order.status)"
                          >
                            {{ attempt.order.status }}
                          </span>
                          <span v-else class="admin-order-log-order-col__pending">未成单</span>
                          <span v-if="attemptProvider(attempt)" class="admin-order-provider">{{
                            attemptProvider(attempt)
                          }}</span>
                        </div>
                        <div v-if="attempt.order" class="admin-order-log-order-col__meta">
                          <span>{{ attempt.order.item || attempt.order.bet }} @ {{ attempt.order.odds }}</span>
                          <span>¥{{ fmtMoney(attempt.order.betMoney) }}</span>
                          <span class="admin-order-log-order-col__oid">#{{ attempt.order.orderId }}</span>
                        </div>
                        <p
                          v-else
                          class="admin-order-log-order-col__meta admin-order-log-order-col__meta--muted"
                        >
                          仅有下注尝试日志，未落库 orders
                        </p>
                      </div>

                      <p
                        v-if="!attempt.logs.length"
                        class="admin-order-log-dialog__empty admin-order-log-platform-col__empty"
                      >
                        无 Client_SaveUserLog
                      </p>
                      <template v-else>
                        <div
                          v-for="(seg, segIdx) in attemptLogSegments(attempt)"
                          :key="`${attempt.key}-${seg.key}`"
                          class="admin-order-log-segment"
                        >
                          <header
                            v-if="seg.accountLabel || seg.isMakeUp"
                            class="admin-order-log-segment__head"
                          >
                            <span v-if="seg.accountLabel" class="admin-order-log-segment__account">{{
                              seg.accountLabel
                            }}</span>
                            <span v-if="seg.isMakeUp" class="admin-order-log-segment__tag">补单轮次</span>
                            <span
                              v-if="attemptLogSegments(attempt).length > 1"
                              class="admin-order-log-segment__round"
                            >
                              轮次 {{ segIdx + 1 }}/{{ attemptLogSegments(attempt).length }}
                            </span>
                          </header>
                          <ul class="admin-order-log-list">
                            <li
                              v-for="(log, i) in seg.logs"
                              :key="log.id ?? `${seg.key}-${i}`"
                              class="admin-order-log-list__row"
                            >
                              <span class="admin-order-log-list__time">{{ fmtTime(log.createAt) }}</span>
                              <span class="admin-order-log-kind" :class="kindClass(log.kind)">{{
                                kindLabel[log.kind] || log.kind
                              }}</span>
                              <span class="admin-order-log-list__summary" :title="log.summary">{{
                                log.summary
                              }}</span>
                            </li>
                          </ul>
                        </div>
                      </template>
                    </div>
                  </template>
                  <p v-else class="admin-order-log-dialog__empty admin-order-log-platform-col__empty">
                    {{ sideLabel(leg) }}无订单与日志
                  </p>
                </section>
              </div>
              <p v-else class="admin-order-log-dialog__empty">该时间窗内无 Client_SaveUserLog 记录</p>
            </section>
          </div>
        </template>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>
