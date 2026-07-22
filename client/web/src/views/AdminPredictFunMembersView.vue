<script setup lang="ts">
import type { AdminOrderRow } from "@/types/admin";
import type { AdminPredictFunMemberRow } from "@/api/admin";
import { ElMessage, ElMessageBox } from "element-plus";
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  deleteAdminOrders,
  ensureAdminPredictFunHouseAccount,
  getAdminOrdersAll,
  getAdminPredictFunFeeConfig,
  getAdminPredictFunMembers,
  saveAdminPredictFunFeeConfig,
  updateAdminAccountFields,
} from "@/api/admin";
import type { AdminPredictFunFeeConfig } from "@/api/admin";
import AdminLayout from "@/components/admin/AdminLayout.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { adminOrderToOrderRow } from "@/shared/adminOrderDisplay";
import { todayKey } from "@/shared/dateKey";
import {
  pfOrderBetText,
  pfOrderFillPriceText,
  pfOrderItemText,
  pfOrderMatchText,
} from "@/shared/pfOrderDisplay";
import { buildPfCycles, type PfOrderCycle } from "@/shared/pfOrderCycle";
import { useUserStore } from "@/stores/userStore";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();

const loading = ref(false);
const saving = ref(false);
const ensuringId = ref("");
const rows = ref<AdminPredictFunMemberRow[]>([]);
const loadError = ref("");

const feeLoading = ref(false);
const feeSaving = ref(false);
const feeForm = reactive({
  buyFeeRatePercent: 0,
  sellFeeRatePercent: 0,
});
const feeMeta = ref<Pick<AdminPredictFunFeeConfig, "updatedAt"> | null>(null);

const keyword = ref(String(route.query.q || ""));
const filterStatus = ref<"all" | "open" | "closed" | "paused">("all");

const editOpen = ref(false);
const editTarget = ref<AdminPredictFunMemberRow | null>(null);
const editForm = reactive({
  balance: 0,
  maxBalance: 0,
  multiply: 1,
  pause: false,
  description: "",
});

/** 可同时展开多个会员；每个会员独立日期 / 列表 */
interface MemberOrdersPanel {
  userId: string;
  accountId: number;
  date: string;
  loading: boolean;
  error: string;
  orders: AdminOrderRow[];
}

const expandRowKeys = ref<string[]>([]);
const panelsByUserId = reactive<Record<string, MemberOrdersPanel>>({});

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return rows.value.filter((r) => {
    if (filterStatus.value === "open" && !r.hasAccount)
      return false;
    if (filterStatus.value === "closed" && r.hasAccount)
      return false;
    if (filterStatus.value === "paused" && (!r.hasAccount || !r.pause))
      return false;
    if (!q)
      return true;
    const hay = [r.userName, r.memberName, r.description, String(r.accountId)]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
});

const openedCount = computed(() => rows.value.filter(r => r.hasAccount).length);

function isOrdersExpanded(row: AdminPredictFunMemberRow) {
  return expandRowKeys.value.includes(row.userId);
}

function getPanel(userId: string): MemberOrdersPanel | undefined {
  return panelsByUserId[userId];
}

function panelCycles(panel: MemberOrdersPanel): PfOrderCycle[] {
  return buildPfCycles(panel.orders);
}

function panelDayProfitUsdt(panel: MemberOrdersPanel) {
  return panelCycles(panel).reduce((sum, c) => {
    return sum + (c.profitUsdt != null ? c.profitUsdt : 0);
  }, 0);
}

function fmtMoney(n: number | undefined) {
  if (n == null || Number.isNaN(Number(n)))
    return "—";
  return Math.floor(Number(n)).toLocaleString();
}

function fmtTime(ts: number) {
  if (!ts)
    return "—";
  return new Date(ts).toLocaleString();
}

/** 库内 USDT：固定两位小数 */
function fmtUsdt(n: number) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 份额：最多 8 位，去掉尾零（对齐官网持仓） */
function fmtShares(n: number) {
  const fixed = Number(n).toFixed(8).replace(/\.?0+$/, "");
  return fixed || "0";
}

function fmtNumOrDash(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n))
    return "—";
  return fmtShares(n);
}

function fmtUsdtOrDash(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n))
    return "—";
  return `${fmtUsdt(n)} U`;
}

function cycleFeeRateLabel(cycle: PfOrderCycle) {
  const bps = cycle.feeRateBps;
  if (bps == null || !Number.isFinite(bps) || bps < 0)
    return "—";
  const pct = bps / 100;
  return `${pct.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function cycleLifecycleLabel(cycle: PfOrderCycle) {
  if (cycle.sell || String(cycle.buy.pfSellState || "").toLowerCase() === "closed")
    return "已卖出";
  const s = String(cycle.buy.status || "").toLowerCase();
  if (s === "win")
    return "到期赢";
  if (s === "lose")
    return "到期输";
  if (s === "reject")
    return "拒单";
  if (s === "pending")
    return "待成交";
  return "持仓中";
}

function orderMatchLabel(row: AdminOrderRow) {
  return pfOrderMatchText(adminOrderToOrderRow(row));
}

function orderBetLabel(row: AdminOrderRow) {
  return pfOrderBetText(adminOrderToOrderRow(row));
}

function orderItemLabel(row: AdminOrderRow) {
  return pfOrderItemText(adminOrderToOrderRow(row));
}

function orderBuyPriceText(row: AdminOrderRow) {
  return pfOrderFillPriceText(adminOrderToOrderRow(row)) || "—";
}

function cycleSellOrderId(cycle: PfOrderCycle) {
  const fromSell = String(cycle.sell?.orderId || "").trim();
  if (fromSell)
    return fromSell;
  const fromBuy = String(cycle.buy.pfSellOrderId || "").trim();
  return fromBuy || "—";
}

function statusBadgeClass(status: string) {
  const s = String(status || "").toLowerCase();
  if (s === "win")
    return "admin-badge--win";
  if (s === "lose")
    return "admin-badge--lose";
  if (s === "reject")
    return "admin-badge--reject";
  if (s === "pending")
    return "admin-badge--pending";
  return "";
}

function moneyClass(n: number | undefined) {
  const v = Number(n) || 0;
  if (v > 0)
    return "pos";
  if (v < 0)
    return "neg";
  return "";
}

function syncQuery() {
  const q: Record<string, string> = {};
  if (keyword.value.trim())
    q.q = keyword.value.trim();
  if (filterStatus.value !== "all")
    q.status = filterStatus.value;
  void router.replace({ name: "admin-predictfun-members", query: q });
}

async function load() {
  loadError.value = "";
  loading.value = true;
  try {
    rows.value = await getAdminPredictFunMembers();
  }
  catch (e) {
    rows.value = [];
    loadError.value = (e as Error).message || "加载失败";
  }
  finally {
    loading.value = false;
  }
}

async function loadFeeConfig() {
  feeLoading.value = true;
  try {
    const cfg = await getAdminPredictFunFeeConfig();
    feeForm.buyFeeRatePercent = Number(cfg.buyFeeRatePercent) || 0;
    feeForm.sellFeeRatePercent = Number(cfg.sellFeeRatePercent) || 0;
    feeMeta.value = { updatedAt: cfg.updatedAt ?? null };
  }
  catch (e) {
    ElMessage.error((e as Error).message || "加载费率失败");
  }
  finally {
    feeLoading.value = false;
  }
}

async function saveFeeConfig() {
  if (feeSaving.value)
    return;
  feeSaving.value = true;
  try {
    const cfg = await saveAdminPredictFunFeeConfig({
      buyFeeRatePercent: feeForm.buyFeeRatePercent,
      sellFeeRatePercent: feeForm.sellFeeRatePercent,
    });
    feeForm.buyFeeRatePercent = Number(cfg.buyFeeRatePercent) || 0;
    feeForm.sellFeeRatePercent = Number(cfg.sellFeeRatePercent) || 0;
    feeMeta.value = { updatedAt: cfg.updatedAt ?? null };
    ElMessage.success("费率已保存");
  }
  catch (e) {
    ElMessage.error((e as Error).message || "保存费率失败");
  }
  finally {
    feeSaving.value = false;
  }
}

async function onEnsure(row: AdminPredictFunMemberRow) {
  if (ensuringId.value)
    return;
  ensuringId.value = row.userId;
  try {
    const result = await ensureAdminPredictFunHouseAccount(row.userId);
    ElMessage.success(
      result.created
        ? `已开通会员「${result.account.playerName || row.userName}」`
        : `会员已存在「${result.account.playerName || row.userName}」`,
    );
    await load();
  }
  catch (e) {
    ElMessage.error((e as Error).message || "开通失败");
  }
  finally {
    ensuringId.value = "";
  }
}

function openEdit(row: AdminPredictFunMemberRow) {
  if (!row.hasAccount || !row.accountId) {
    ElMessage.warning("请先开通 PF 会员");
    return;
  }
  editTarget.value = row;
  editForm.balance = Number(row.balance) || 0;
  editForm.maxBalance = Number(row.maxBalance) || 0;
  editForm.multiply = Number(row.multiply) || 1;
  editForm.pause = Boolean(row.pause);
  editForm.description = String(row.description || "");
  editOpen.value = true;
}

async function saveEdit() {
  const target = editTarget.value;
  if (!target?.accountId || saving.value)
    return;
  saving.value = true;
  try {
    await updateAdminAccountFields({
      userId: target.userId,
      accountId: target.accountId,
      balance: editForm.balance,
      maxBalance: editForm.maxBalance,
      multiply: editForm.multiply,
      pause: editForm.pause,
      description: editForm.description,
    });
    editOpen.value = false;
    ElMessage.success("已保存");
    await load();
  }
  catch (e) {
    ElMessage.error((e as Error).message || "保存失败");
  }
  finally {
    saving.value = false;
  }
}

async function loadMemberOrders(userId: string) {
  const panel = panelsByUserId[userId];
  if (!panel?.accountId || !panel.userId) {
    return;
  }
  panel.loading = true;
  panel.error = "";
  try {
    const page = await getAdminOrdersAll({
      date: panel.date,
      userId: panel.userId,
      provider: "PredictFun",
      playerId: panel.accountId,
    });
    panel.orders = (page.list ?? []).filter(
      (o) => String(o.provider || "").trim() === "PredictFun",
    );
  }
  catch (e) {
    panel.orders = [];
    panel.error = (e as Error).message || "加载订单失败";
  }
  finally {
    panel.loading = false;
  }
}

function onPanelDateChange(userId: string, date: string) {
  const panel = panelsByUserId[userId];
  if (!panel)
    return;
  panel.date = date;
  void loadMemberOrders(userId);
}

function toggleOrders(row: AdminPredictFunMemberRow) {
  if (!row.accountId) {
    ElMessage.warning("尚未开通会员");
    return;
  }
  const uid = row.userId;
  if (isOrdersExpanded(row)) {
    expandRowKeys.value = expandRowKeys.value.filter(id => id !== uid);
    delete panelsByUserId[uid];
    return;
  }
  expandRowKeys.value = [...expandRowKeys.value, uid];
  panelsByUserId[uid] = {
    userId: uid,
    accountId: row.accountId,
    date: todayKey(),
    loading: false,
    error: "",
    orders: [],
  };
  void loadMemberOrders(uid);
}

async function onDeleteOrders(userId: string, rowsToDelete: AdminOrderRow[]) {
  if (!rowsToDelete.length)
    return;
  const ids = rowsToDelete.map(r => r.id);
  const label
    = rowsToDelete.length > 1
      ? `这 ${rowsToDelete.length} 笔套利订单（Link ${rowsToDelete[0]?.linkId || "—"}）`
      : `订单 ${rowsToDelete[0]?.orderId || ids[0]}`;
  try {
    await ElMessageBox.confirm(`确认删除 ${label}？此操作不可恢复。`, "删除订单", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  }
  catch {
    return;
  }
  try {
    const res = await deleteAdminOrders(ids);
    ElMessage.success(`已删除 ${res.deleted} 笔订单`);
    await loadMemberOrders(userId);
  }
  catch (e) {
    ElMessage.error((e as Error).message || "删除失败");
  }
}

/** 筛选变化时只收起已不在列表中的会员，保留其它展开 */
watch(filtered, (list) => {
  const visible = new Set(list.map(r => r.userId));
  const nextKeys = expandRowKeys.value.filter(id => visible.has(id));
  if (nextKeys.length !== expandRowKeys.value.length)
    expandRowKeys.value = nextKeys;
  for (const id of Object.keys(panelsByUserId)) {
    if (!visible.has(id))
      delete panelsByUserId[id];
  }
});

onMounted(async () => {
  if (!userStore.ready) {
    try {
      await userStore.fetchUserInfo();
    }
    catch {
      sessionStorage.setItem("gamebet:postLoginRedirect", route.fullPath);
      await router.replace({ name: "home" });
      return;
    }
  }
  if (!userStore.isAdmin) {
    await router.replace({ name: "home" });
    return;
  }
  const status = String(route.query.status || "");
  if (status === "open" || status === "closed" || status === "paused")
    filterStatus.value = status;
  await Promise.all([load(), loadFeeConfig()]);
});
</script>

<template>
  <AdminLayout
    title="PF 会员"
    subtitle="Predict.fun changmen 会员：登录名即会员名，运营主号代下；战绩按会员账号统计"
  >
    <section v-loading="feeLoading" class="admin-card admin-pf-fee-card">
      <div class="admin-pf-fee-card__title">
        Changmencodefee
      </div>
      <p class="admin-pf-hint">
        设计：用户只认 changmen / 只读 RDS。份额 = 官网成交 − 官网份额费 − Changmencodefee（买入份额）；回款 = 官网回款 − 官网费 − Changmencodefee（卖出 USDT）。单位为百分比（1 = 1%）。
      </p>
      <div class="admin-pf-fee-form">
        <label class="admin-pf-fee-field">
          <span>买入费率 %</span>
          <el-input-number
            v-model="feeForm.buyFeeRatePercent"
            :min="0"
            :max="100"
            :step="0.01"
            :precision="2"
            size="small"
            controls-position="right"
          />
        </label>
        <label class="admin-pf-fee-field">
          <span>卖出费率 %</span>
          <el-input-number
            v-model="feeForm.sellFeeRatePercent"
            :min="0"
            :max="100"
            :step="0.01"
            :precision="2"
            size="small"
            controls-position="right"
          />
        </label>
        <el-button
          type="primary"
          size="small"
          :loading="feeSaving"
          @click="saveFeeConfig"
        >
          保存费率
        </el-button>
        <span v-if="feeMeta?.updatedAt" class="admin-pf-fee-updated">
          已保存 {{ new Date(feeMeta.updatedAt).toLocaleString() }}
        </span>
      </div>
    </section>

    <section v-loading="loading" class="admin-card">
      <div class="admin-card__toolbar admin-pf-toolbar">
        <el-input
          v-model="keyword"
          clearable
          size="small"
          placeholder="搜索用户 / 会员名"
          style="width: 200px"
          @change="syncQuery"
          @clear="syncQuery"
        />
        <el-select
          v-model="filterStatus"
          size="small"
          style="width: 120px"
          @change="syncQuery"
        >
          <el-option label="全部" value="all" />
          <el-option label="已开通" value="open" />
          <el-option label="未开通" value="closed" />
          <el-option label="已暂停" value="paused" />
        </el-select>
        <el-button size="small" @click="load">
          刷新
        </el-button>
        <span class="admin-pf-count">
          已开通 {{ openedCount }} / {{ rows.length }}
        </span>
      </div>

      <p class="admin-pf-hint">
        会员名固定为 changmen 登录名；下单走 VPS 运营主号。点「订单」在该会员行下方展开当日 PredictFun 订单。
      </p>

      <p v-if="loadError" class="admin-card__empty admin-card__empty--error">
        {{ loadError }}
      </p>

      <div v-else class="admin-card__body">
        <el-table
          :data="filtered"
          size="small"
          stripe
          row-key="userId"
          :expand-row-keys="expandRowKeys"
        >
          <el-table-column type="expand" width="1" class-name="admin-pf-expand-col">
            <template #default="{ row }">
              <div v-if="isOrdersExpanded(row) && getPanel(row.userId)" class="admin-pf-orders-panel">
                <div class="admin-pf-orders-toolbar">
                  <OrderDateNav
                    :model-value="getPanel(row.userId)!.date"
                    placeholder="订单日期"
                    @update:model-value="(d) => onPanelDateChange(row.userId, d)"
                  />
                  <el-button
                    size="small"
                    :loading="getPanel(row.userId)!.loading"
                    @click="loadMemberOrders(row.userId)"
                  >
                    刷新
                  </el-button>
                  <span class="admin-pf-orders-summary">
                    {{ panelCycles(getPanel(row.userId)!).length }} 轮
                    · 当日盈亏
                    <span :class="moneyClass(panelDayProfitUsdt(getPanel(row.userId)!))">
                      {{ fmtUsdt(panelDayProfitUsdt(getPanel(row.userId)!)) }} U
                    </span>
                  </span>
                </div>
                <p v-if="getPanel(row.userId)!.error" class="admin-pf-orders-error">
                  {{ getPanel(row.userId)!.error }}
                </p>
                <div v-loading="getPanel(row.userId)!.loading" class="admin-pf-orders-body">
                  <el-table
                    :data="panelCycles(getPanel(row.userId)!)"
                    size="small"
                    stripe
                    class="admin-orders-el-table"
                    empty-text="当日暂无 PF 买单"
                  >
                    <el-table-column label="时间" width="156" show-overflow-tooltip>
                      <template #default="{ row: cycle }">
                        <span class="admin-order-time">{{ fmtTime(cycle.buy.createAt) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="结局" width="72" align="center">
                      <template #default="{ row: cycle }">
                        {{ cycleLifecycleLabel(cycle) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="比赛" min-width="140" show-overflow-tooltip>
                      <template #default="{ row: cycle }">
                        {{ orderMatchLabel(cycle.buy) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="盘口" min-width="90" show-overflow-tooltip>
                      <template #default="{ row: cycle }">
                        {{ orderBetLabel(cycle.buy) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="选项" width="90" show-overflow-tooltip>
                      <template #default="{ row: cycle }">
                        {{ orderItemLabel(cycle.buy) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="买入价" width="72" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ orderBuyPriceText(cycle.buy) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="名义买入" width="88" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtUsdtOrDash(cycle.buyNotionalUsdt) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="实付" width="80" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtUsdtOrDash(cycle.buyFillCostUsdt) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="用户扣款" width="80" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtUsdt(cycle.buyStakeUsdt) }} U</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="价差" width="72" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtUsdtOrDash(cycle.houseEdgeUsdt) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="成交份额" width="80" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtNumOrDash(cycle.buyShares) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="买手续费份额" width="100" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtNumOrDash(cycle.buyFeeShares) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="费率" width="64" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ cycleFeeRateLabel(cycle) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="持仓份额" width="88" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtNumOrDash(cycle.netShares) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="卖出回款" width="88" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtUsdtOrDash(cycle.sellProceedsUsdt) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="卖手续费" width="88" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">
                          <template v-if="cycle.sellFeeUsdt != null">{{ fmtUsdt(cycle.sellFeeUsdt) }} U</template>
                          <template v-else-if="cycle.sellFeeShares != null">{{ fmtUsdt(cycle.sellFeeShares) }} 份</template>
                          <template v-else>—</template>
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column label="最终到手" width="88" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span class="admin-order-num">{{ fmtUsdtOrDash(cycle.finalUsdt) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="盈亏" width="88" align="right" class-name="admin-order-cell--num">
                      <template #default="{ row: cycle }">
                        <span
                          class="admin-order-num"
                          :class="{
                            pos: (cycle.profitUsdt ?? 0) > 0,
                            neg: (cycle.profitUsdt ?? 0) < 0,
                          }"
                        >
                          {{ fmtUsdtOrDash(cycle.profitUsdt) }}
                        </span>
                      </template>
                    </el-table-column>
                    <el-table-column label="状态" width="80" align="center" class-name="admin-order-cell--center">
                      <template #default="{ row: cycle }">
                        <span class="admin-badge" :class="statusBadgeClass(cycle.buy.status)">{{ cycle.buy.status || "—" }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="买单号" min-width="120" show-overflow-tooltip>
                      <template #default="{ row: cycle }">
                        <span class="admin-order-mono">{{ cycle.buy.orderId || "—" }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="卖单号" min-width="120" show-overflow-tooltip>
                      <template #default="{ row: cycle }">
                        <span class="admin-order-mono">{{ cycleSellOrderId(cycle) }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="操作" width="72" align="center" class-name="admin-order-cell--center">
                      <template #default="{ row: cycle }">
                        <el-button
                          link
                          type="danger"
                          size="small"
                          @click="onDeleteOrders(row.userId, [cycle.buy, ...(cycle.sell ? [cycle.sell] : [])])"
                        >
                          删除
                        </el-button>
                      </template>
                    </el-table-column>
                  </el-table>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="用户" width="120" prop="userName" />
          <el-table-column label="会员名" min-width="120">
            <template #default="{ row }">
              <div class="admin-pf-member">
                <span>{{ row.memberName || "—" }}</span>
                <span v-if="row.accountId" class="admin-pf-member__id">#{{ row.accountId }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="96" align="center">
            <template #default="{ row }">
              <el-tag v-if="!row.hasAccount" type="info" size="small">
                未开通
              </el-tag>
              <el-tag v-else-if="row.pause" type="danger" size="small">
                暂停
              </el-tag>
              <el-tag v-else type="success" size="small">
                使用中
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="余额" width="100" align="right">
            <template #default="{ row }">
              {{ row.hasAccount ? fmtMoney(row.balance) : "—" }}
            </template>
          </el-table-column>
          <el-table-column label="今日" width="100" align="right">
            <template #default="{ row }">
              <span v-if="row.hasAccount" :class="moneyClass(row.today)">{{ fmtMoney(row.today) }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="累计盈亏" width="110" align="right">
            <template #default="{ row }">
              <span v-if="row.hasAccount" :class="moneyClass(row.totalProfit)">{{ fmtMoney(row.totalProfit) }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.description || "—" }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right" align="center">
            <template #default="{ row }">
              <el-button
                v-if="!row.hasAccount"
                size="small"
                link
                type="primary"
                :loading="ensuringId === row.userId"
                @click="onEnsure(row)"
              >
                开通
              </el-button>
              <template v-else>
                <el-button size="small" link type="primary" @click="openEdit(row)">
                  编辑
                </el-button>
                <el-button
                  size="small"
                  link
                  @click="toggleOrders(row)"
                >
                  {{ isOrdersExpanded(row) ? "收起" : "订单" }}
                </el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </section>

    <el-dialog
      v-model="editOpen"
      title="编辑 PF 会员"
      width="480px"
      destroy-on-close
      append-to-body
    >
      <template v-if="editTarget">
        <p class="admin-pf-edit-meta">
          {{ editTarget.userName }} · 会员 {{ editTarget.memberName }}
          <span class="admin-pf-member__id">#{{ editTarget.accountId }}</span>
        </p>
        <el-form label-width="96px">
          <el-form-item label="余额">
            <el-input-number v-model="editForm.balance" :min="0" :step="100" controls-position="right" />
          </el-form-item>
          <el-form-item label="上限">
            <el-input-number v-model="editForm.maxBalance" :min="0" :step="100" controls-position="right" />
          </el-form-item>
          <el-form-item label="乘网">
            <el-input-number
              v-model="editForm.multiply"
              :min="0.01"
              :step="0.01"
              :precision="2"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item label="暂停">
            <el-switch v-model="editForm.pause" />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="editForm.description" type="textarea" :rows="2" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="editOpen = false">
          取消
        </el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </AdminLayout>
</template>

<style scoped>
.admin-pf-toolbar {
  flex-wrap: wrap;
  gap: 8px;
}
.admin-pf-fee-card__title {
  font-weight: 600;
  margin: 0 12px 4px;
  font-size: 14px;
}
.admin-pf-fee-form {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  align-items: flex-end;
  margin: 0 12px 12px;
}
.admin-pf-fee-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--adm-text-muted);
}
.admin-pf-fee-updated {
  font-size: 12px;
  color: var(--adm-text-muted);
}
.admin-pf-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--adm-text-muted);
}
.admin-pf-hint {
  margin: 0 12px 10px;
  font-size: 12px;
  color: var(--adm-text-muted);
  line-height: 1.5;
}
.admin-pf-member {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.3;
}
.admin-pf-member__id {
  font-size: 11px;
  color: var(--adm-text-muted);
  font-family: ui-monospace, monospace;
}
.admin-pf-edit-meta {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--adm-text-muted);
}
.admin-pf-orders-panel {
  margin: 0 8px 8px;
  padding: 10px 12px 12px;
  border: 1px solid var(--adm-border);
  border-radius: var(--adm-radius);
  background: var(--adm-surface-2);
}
.admin-pf-orders-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.admin-pf-orders-summary {
  margin-left: auto;
  font-size: 12px;
  color: var(--adm-text-muted);
}
.admin-pf-orders-error {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--adm-danger);
}
.admin-pf-orders-body {
  min-height: 72px;
}
:deep(.admin-pf-expand-col) {
  width: 0 !important;
  padding: 0 !important;
  border: 0 !important;
}
:deep(.admin-pf-expand-col .cell) {
  padding: 0 !important;
  width: 0 !important;
  overflow: hidden;
}
:deep(.admin-pf-expand-col .el-table__expand-icon) {
  display: none !important;
}
</style>
