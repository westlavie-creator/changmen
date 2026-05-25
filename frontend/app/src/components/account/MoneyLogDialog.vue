<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppDialog from "@/components/ui/AppDialog.vue";
import MoneyInfoDialog from "@/components/account/MoneyInfoDialog.vue";
import { deleteMoneyLog, getMoneyLogs } from "@/api/esport";
import { useAccountStore } from "@/stores/accountStore";
import { formatDate } from "@/utils/format";

interface MoneyLogItem {
  logId?: number;
  playerId?: number;
  type?: string;
  money?: number;
  description?: string;
  createAt?: number;
}

const props = defineProps<{
  open: boolean;
  accountId: number;
}>();

const emit = defineEmits<{ close: [] }>();

const accountStore = useAccountStore();

const logs = ref<MoneyLogItem[]>([]);
const pageIndex = ref(1);
const pageSize = 10;
const total = ref(0);
const loading = ref(false);
const infoOpen = ref(false);
const editLogId = ref<number | undefined>();

const account = computed(() => accountStore.findAccount(props.accountId));

const title = computed(() => {
  const acc = account.value;
  if (!acc) return "充提登记";
  return `${acc.platformName || acc.provider} / ${acc.playerName}`;
});

const rechargeTotal = computed(() =>
  logs.value.filter((r) => r.type === "Recharge").reduce((s, r) => s + (r.money ?? 0), 0),
);

const withdrawTotal = computed(() =>
  logs.value.filter((r) => r.type === "Withdraw").reduce((s, r) => s + (r.money ?? 0), 0),
);

const typeLabel: Record<string, string> = {
  Recharge: "充值",
  Withdraw: "提现",
  Lose: "被黑",
};

async function loadLogs(page = pageIndex.value) {
  if (!props.accountId) return;
  loading.value = true;
  try {
    const res = await getMoneyLogs({
      playerId: props.accountId,
      pageIndex: page,
      pageSize,
    });
    logs.value = (res?.list ?? []) as MoneyLogItem[];
    total.value = res?.total ?? 0;
    pageIndex.value = page;
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    void loadLogs(1);
  },
  { immediate: true },
);

function openCreate() {
  editLogId.value = undefined;
  infoOpen.value = true;
}

function openEdit(row: MoneyLogItem) {
  editLogId.value = row.logId;
  infoOpen.value = true;
}

async function removeLog(row: MoneyLogItem) {
  if (!row.logId || !confirm("确认删除这条记录？")) return;
  await deleteMoneyLog({ logId: row.logId });
  await loadLogs(pageIndex.value);
}

function editCredit() {
  const acc = account.value;
  if (!acc) return;
  const raw = window.prompt("请输入当前的授信额度", String(acc.credit ?? 0));
  if (!raw || Number.isNaN(Number(raw))) return;
  acc.credit = Number(raw);
  void accountStore.saveAccounts();
}

async function onInfoSaved() {
  await loadLogs(pageIndex.value);
  await accountStore.loadAccounts();
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
</script>

<template>
  <AppDialog :open="open" :title="title" width="800px" @close="emit('close')">
    <div v-if="account" class="money-view">
      <div class="stats flex flex-wrap">
        <div class="stat">
          <span class="stat__label">充值</span>
          <strong>￥{{ rechargeTotal.toFixed(0) }}</strong>
        </div>
        <div class="stat">
          <span class="stat__label">提现</span>
          <strong>￥{{ withdrawTotal.toFixed(0) }}</strong>
        </div>
        <div class="stat stat--click" title="双击修改授信" @dblclick="editCredit">
          <span class="stat__label">授信额度</span>
          <strong>￥{{ (account.credit ?? 0).toFixed(0) }}</strong>
        </div>
        <div class="stat">
          <span class="stat__label">当前余额</span>
          <strong>{{ account.balance ?? "—" }}</strong>
        </div>
        <div class="stat">
          <span class="stat__label">账号盈亏</span>
          <strong>{{ (account.totalProfit ?? 0).toFixed(0) }}</strong>
        </div>
      </div>

      <div class="table-head flex flex-between flex-middle">
        <strong>充提记录</strong>
        <button type="button" class="link-btn" @click="openCreate">+ 新增</button>
      </div>

      <div class="table-wrap">
        <table class="log-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>金额</th>
              <th>时间</th>
              <th>备注</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="empty">加载中…</td>
            </tr>
            <tr v-else-if="!logs.length">
              <td colspan="5" class="empty">暂无记录</td>
            </tr>
            <tr
              v-for="row in logs"
              :key="row.logId"
              :class="`row-${row.type}`"
            >
              <td>{{ typeLabel[row.type ?? ""] || row.type }}</td>
              <td>{{ row.money }}</td>
              <td>{{ formatDate(row.createAt ?? 0) }}</td>
              <td>{{ row.description || "—" }}</td>
              <td class="actions">
                <button type="button" class="icon-btn" title="编辑" @click="openEdit(row)">✎</button>
                <button type="button" class="icon-btn icon-btn--danger" title="删除" @click="removeLog(row)">
                  ×
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="pager flex flex-middle">
        <button type="button" class="pager-btn" :disabled="pageIndex <= 1" @click="loadLogs(pageIndex - 1)">
          上一页
        </button>
        <span>{{ pageIndex }} / {{ totalPages }}</span>
        <button
          type="button"
          class="pager-btn"
          :disabled="pageIndex >= totalPages"
          @click="loadLogs(pageIndex + 1)"
        >
          下一页
        </button>
      </div>
    </div>

    <MoneyInfoDialog
      :open="infoOpen"
      :player-id="accountId"
      :log-id="editLogId"
      @close="infoOpen = false"
      @saved="onInfoSaved"
    />
  </AppDialog>
</template>

<style scoped>
.money-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stats {
  gap: 10px;
}
.stat {
  flex: 1;
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #0f172a;
}
.stat--click {
  cursor: pointer;
}
.stat__label {
  display: block;
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;
}
.table-head {
  font-size: 13px;
}
.link-btn {
  border: none;
  background: none;
  color: #38bdf8;
  cursor: pointer;
  font-size: 12px;
}
.table-wrap {
  overflow: auto;
  max-height: 280px;
}
.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.log-table th,
.log-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #334155;
  text-align: left;
}
.log-table .empty {
  text-align: center;
  color: #64748b;
  padding: 16px;
}
.row-Withdraw td:nth-child(2) {
  color: #f87171;
}
.row-Recharge td:nth-child(2) {
  color: #4ade80;
}
.actions {
  white-space: nowrap;
  text-align: right;
}
.icon-btn {
  border: 1px solid #475569;
  background: transparent;
  color: #cbd5e1;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  margin-left: 4px;
}
.icon-btn--danger {
  color: #fca5a5;
}
.pager {
  gap: 10px;
  justify-content: center;
  font-size: 12px;
  color: #94a3b8;
}
.pager-btn {
  padding: 4px 10px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
}
.pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
