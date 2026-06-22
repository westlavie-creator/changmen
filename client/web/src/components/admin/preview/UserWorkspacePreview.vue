<script setup lang="ts">
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import { ElMessage, ElMessageBox } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { deleteAdminOrders, getAdminOrdersAll } from "@/api/admin";
import AccountCard from "@/components/account/AccountCard.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import AdminOrderLogsDialog from "@/components/admin/AdminOrderLogsDialog.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import { todayKey } from "@/shared/dateKey";
import { formatDisplayOdds, formatOrderTime, toFixed } from "@/shared/format";
import { useAccountStore } from "@/stores/accountStore";

const props = defineProps<{
  user: AdminUserRow;
}>();

defineEmits<{ viewOrders: [] }>();

const accountStore = useAccountStore();
const { sortedAccounts, editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

const date = ref(todayKey());
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const loadError = ref("");
const logsDialogRef = ref<InstanceType<typeof AdminOrderLogsDialog> | null>(null);

interface LinkRow {
  linkId: number;
  createAt: number;
  cells: Map<number, AdminOrderRow[]>;
  totalMoney: number;
}

const accounts = computed(() => sortedAccounts.value);

const linkRows = computed<LinkRow[]>(() => {
  const byLink = new Map<number, { createAt: number; cells: Map<number, AdminOrderRow[]>; totalMoney: number }>();
  for (const row of orders.value) {
    const lid = row.linkId || 0;
    if (!byLink.has(lid)) {
      byLink.set(lid, { createAt: row.createAt, cells: new Map(), totalMoney: 0 });
    }
    const entry = byLink.get(lid)!;
    entry.totalMoney += Number(row.money) || 0;
    if (row.createAt < entry.createAt)
      entry.createAt = row.createAt;
    const accId = row.playerId;
    if (!entry.cells.has(accId))
      entry.cells.set(accId, []);
    entry.cells.get(accId)!.push(row);
  }
  return [...byLink.entries()]
    .map(([linkId, v]) => ({ linkId, ...v }))
    .sort((a, b) => b.createAt - a.createAt);
});

const profitTotal = computed(() =>
  orders.value.reduce((sum, r) => sum + (Number(r.money) || 0), 0),
);

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function moneyClass(n: number) {
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "";
}

function statusClass(s: string) {
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower === "win" || lower === "赢") return "Win";
  if (lower === "lose" || lower === "输") return "Lose";
  if (lower === "reject" || lower === "拒单") return "Reject";
  return "";
}

async function loadOrders() {
  loading.value = true;
  loadError.value = "";
  try {
    const page = await getAdminOrdersAll({ userId: props.user.id, date: date.value });
    orders.value = page.list ?? [];
  }
  catch (e) {
    orders.value = [];
    loadError.value = (e as Error).message || "加载失败";
  }
  finally {
    loading.value = false;
  }
}

async function onDeleteLink(linkRows: AdminOrderRow[]) {
  if (!linkRows.length) return;
  const ids = linkRows.map(r => r.id);
  const label = `这 ${linkRows.length} 笔订单（Link ${linkRows[0]?.linkId || "—"}）`;
  try {
    await ElMessageBox.confirm(`确认删除 ${label}？`, "删除订单", {
      type: "warning", confirmButtonText: "删除", cancelButtonText: "取消",
    });
  }
  catch { return; }
  try {
    const res = await deleteAdminOrders(ids);
    ElMessage.success(`已删除 ${res.deleted} 笔订单`);
    await loadOrders();
  }
  catch (e) {
    ElMessage.error((e as Error).message || "删除失败");
  }
}

function allOrdersForLink(row: LinkRow): AdminOrderRow[] {
  const result: AdminOrderRow[] = [];
  for (const rows of row.cells.values())
    result.push(...rows);
  return result;
}

function openLogs(rows: AdminOrderRow[]) {
  logsDialogRef.value?.open(rows);
}

watch(date, () => void loadOrders());
watch(() => props.user.id, () => void loadOrders());
onMounted(() => void loadOrders());
</script>

<template>
  <div class="user-workspace-preview" v-loading="loading">
    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      readonly
      @close="accountStore.closeAccountDialog()"
    />

    <div class="user-workspace-preview__toolbar">
      <OrderDateNav v-model="date" placeholder="日期" />
      <el-button size="small" @click="loadOrders">
        刷新
      </el-button>
      <span v-if="orders.length" class="user-workspace-preview__summary">
        {{ accounts.length }} 个账号 · {{ orders.length }} 笔订单 · {{ linkRows.length }} 组 ·
        利润
        <span :class="moneyClass(profitTotal)">{{ fmtMoney(profitTotal) }}</span>
      </span>
    </div>

    <p v-if="loadError" class="user-workspace-preview__err">
      {{ loadError }}
    </p>

    <div v-if="accounts.length && linkRows.length" class="link-matrix-wrap">
      <table class="link-matrix">
        <thead>
          <tr>
            <th class="link-matrix__corner">Link</th>
            <th v-for="acc in accounts" :key="acc.accountId" class="link-matrix__acc-head">
              <AccountCard
                :account="acc"
                preview
                class="link-matrix__card"
                @edit="accountStore.openEditAccount(acc)"
              />
            </th>
            <th class="link-matrix__corner">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in linkRows" :key="row.linkId" class="link-matrix__row">
            <td class="link-matrix__link-cell">
              <span class="link-matrix__link-profit" :class="moneyClass(row.totalMoney)">
                {{ fmtMoney(row.totalMoney) }}
              </span>
            </td>
            <td
              v-for="acc in accounts"
              :key="acc.accountId"
              class="link-matrix__cell"
            >
              <div
                v-for="order in (row.cells.get(acc.accountId) || [])"
                :key="order.id"
                class="link-matrix__order"
              >
                <label class="link-matrix__status" :class="statusClass(order.status)" />
                <div class="link-matrix__match">{{ order.match }}</div>
                <div class="link-matrix__bet">
                  <span v-html="order.bet" />
                  <span class="link-matrix__item" v-html="order.item" />
                </div>
                <div class="link-matrix__nums">
                  {{ order.betMoney }} × <span class="link-matrix__odds">{{ formatDisplayOdds(order.odds) }}</span>
                  = <span :class="moneyClass(order.money)">{{ toFixed(order.money, 0) }}</span>
                </div>
                <div class="link-matrix__time">{{ formatOrderTime(order.createAt) }}</div>
              </div>
            </td>
            <td class="link-matrix__action-cell">
              <el-button link type="primary" size="small" @click="openLogs(allOrdersForLink(row))">
                诊断
              </el-button>
              <el-button link type="danger" size="small" @click="onDeleteLink(allOrdersForLink(row))">
                删除
              </el-button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!loading && !loadError && !linkRows.length" class="user-workspace-preview__empty">
      {{ date }} 暂无订单
    </p>

    <AdminOrderLogsDialog ref="logsDialogRef" />
  </div>
</template>

<style scoped>
.user-workspace-preview {
  min-height: 400px;
}
.user-workspace-preview__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px 12px;
}
.user-workspace-preview__summary {
  font-size: 13px;
  color: #94a3b8;
}
.user-workspace-preview__err {
  margin: 0; padding: 8px 12px; font-size: 12px;
  color: #f87171; background: rgba(248, 113, 113, 0.08);
}
.user-workspace-preview__empty {
  text-align: center; font-size: 13px; color: #94a3b8; margin: 40px 0;
}

/* ── 矩阵表格 ── */
.link-matrix-wrap {
  overflow-x: auto;
  padding-bottom: 8px;
}
.link-matrix {
  border-collapse: separate;
  border-spacing: 0;
  width: max-content;
  min-width: 100%;
}
.link-matrix th,
.link-matrix td {
  vertical-align: top;
  border-bottom: 1px solid var(--adm-border, rgba(255,255,255,0.08));
}

/* 表头 */
.link-matrix__corner {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--adm-surface, #1e293b);
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--adm-text-muted, #94a3b8);
  min-width: 60px;
  white-space: nowrap;
}
.link-matrix__acc-head {
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--adm-surface, #1e293b);
  padding: 0;
  min-width: 220px;
  width: 220px;
}
.link-matrix__card {
  transform: scale(0.9);
  transform-origin: top left;
}

/* Link 列 */
.link-matrix__link-cell {
  padding: 8px;
  text-align: center;
  font-weight: 600;
  font-size: 13px;
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--adm-surface, #1e293b);
}
.link-matrix__link-profit { font-variant-numeric: tabular-nums; }

/* 单元格 */
.link-matrix__cell {
  padding: 6px;
  min-width: 220px;
}

/* 订单卡片（简化版） */
.link-matrix__order {
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--adm-surface-2, rgba(255,255,255,0.03));
  font-size: 12px;
  line-height: 1.5;
}
.link-matrix__order + .link-matrix__order {
  margin-top: 4px;
}
.link-matrix__status {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  margin-right: 4px;
  background: #94a3b8;
}
.link-matrix__status.Win { background: #67c23a; }
.link-matrix__status.Lose { background: #f56c6c; }
.link-matrix__status.Reject { background: #e6a23c; }

.link-matrix__match {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.link-matrix__bet {
  color: var(--adm-text-muted, #94a3b8);
}
.link-matrix__item {
  color: var(--el-color-primary, #409eff);
  margin-left: 8px;
}
.link-matrix__nums {
  margin-top: 2px;
}
.link-matrix__odds {
  color: var(--el-color-primary, #409eff);
}
.link-matrix__time {
  color: var(--adm-text-muted, #64748b);
  font-size: 11px;
}

/* 操作列 */
.link-matrix__action-cell {
  padding: 8px 4px;
  white-space: nowrap;
  position: sticky;
  right: 0;
  z-index: 2;
  background: var(--adm-surface, #1e293b);
}

.pos { color: var(--adm-success, #67c23a); }
.neg { color: var(--adm-danger, #f56c6c); }
</style>
