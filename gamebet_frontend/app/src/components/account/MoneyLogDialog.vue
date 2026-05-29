<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import MoneyInfoDialog from "@/components/account/MoneyInfoDialog.vue";
import MoneyRiskView from "@/components/account/MoneyRiskView.vue";
import { deleteMoneyLog, getMoneyLogs } from "@/api/esport";
import { useAccountStore } from "@/stores/accountStore";
import { formatDate } from "@/shared/format";

interface MoneyLogRow {
  logId?: number;
  ID?: number;
  playerId?: number;
  type?: string;
  Type?: string;
  money?: number;
  Money?: number;
  currency?: string;
  Currency?: string;
  description?: string;
  Description?: string;
  isAuto?: number;
  IsAuto?: number;
  createAt?: number;
  CreateAt?: number;
}

const props = defineProps<{
  open: boolean;
  accountId: number;
}>();

const emit = defineEmits<{ close: [] }>();

const accountStore = useAccountStore();

const visible = ref(false);
const logs = ref<MoneyLogRow[]>([]);
const allLogs = ref<MoneyLogRow[]>([]);
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

const typeLabels: Record<string, string> = {
  Recharge: "充值",
  Withdraw: "提现",
  Lose: "被黑",
};

function rowId(row: MoneyLogRow) {
  return row.logId ?? row.ID;
}

function rowType(row: MoneyLogRow) {
  return row.type ?? row.Type ?? "";
}

function rowMoney(row: MoneyLogRow) {
  return Number(row.money ?? row.Money) || 0;
}

function rowCurrency(row: MoneyLogRow) {
  return row.currency ?? row.Currency ?? "CNY";
}

function rowDescription(row: MoneyLogRow) {
  return row.description ?? row.Description ?? "";
}

function rowCreateAt(row: MoneyLogRow) {
  return row.createAt ?? row.CreateAt ?? 0;
}

function rowIsAuto(row: MoneyLogRow) {
  if (row.isAuto === 1 || row.IsAuto === 1) return true;
  const desc = rowDescription(row);
  return rowType(row) === "Withdraw" && /\d+sec|\d+s$/i.test(desc);
}

const rechargeTotal = computed(() =>
  allLogs.value
    .filter((r) => rowType(r) === "Recharge")
    .reduce((s, r) => s + rowMoney(r), 0),
);

const withdrawTotal = computed(() =>
  allLogs.value
    .filter((r) => rowType(r) === "Withdraw")
    .reduce((s, r) => s + rowMoney(r), 0),
);

const accountProfit = computed(() => {
  const acc = account.value;
  if (!acc) return 0;
  return (
    withdrawTotal.value -
    rechargeTotal.value +
    (acc.balance ?? 0) -
    (acc.credit ?? 0)
  );
});

function tableRowClass({ row }: { row: MoneyLogRow }) {
  return `row-${rowType(row)}`;
}

async function loadLogs(page = pageIndex.value) {
  if (!props.accountId) return;
  loading.value = true;
  try {
    const res = await getMoneyLogs({
      playerId: props.accountId,
      pageIndex: page,
      pageSize,
    });
    const data = (res as { data?: MoneyLogRow[] })?.data;
    logs.value = (res?.list ?? []) as MoneyLogRow[];
    allLogs.value = data?.length ? data : logs.value;
    total.value = res?.total ?? res?.RecordCount ?? logs.value.length;
    pageIndex.value = page;
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    visible.value = open;
    if (open) void loadLogs(1);
  },
  { immediate: true },
);

function onClosed() {
  emit("close");
}

function openCreate() {
  editLogId.value = undefined;
  infoOpen.value = true;
}

function openEdit(row: MoneyLogRow) {
  editLogId.value = rowId(row);
  infoOpen.value = true;
}

async function removeLog(row: MoneyLogRow) {
  const id = rowId(row);
  if (!id) return;
  try {
    await ElMessageBox.confirm("确认删除吗？", "删除记录", {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });
    await deleteMoneyLog({ logId: id });
    await loadLogs(pageIndex.value);
  } catch {
    /* cancelled */
  }
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
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="800"
    @closed="onClosed"
  >
    <div v-if="account" class="report">
      <el-row>
        <el-col :span="4">
          <el-statistic title="充值" :value="rechargeTotal" :precision="0" prefix="￥" />
        </el-col>
        <el-col :span="5">
          <el-statistic title="提现" :value="withdrawTotal" :precision="0" prefix="￥" />
        </el-col>
        <el-col :span="5">
          <el-statistic
            title="授信额度"
            :value="account.credit ?? 0"
            :precision="0"
            prefix="￥"
            @dblclick="editCredit"
          />
        </el-col>
        <el-col :span="5">
          <el-statistic
            title="当前余额"
            :value="account.balance ?? 0"
            :precision="0"
            :prefix="String(account.currency || 'CNY')"
          />
        </el-col>
        <el-col :span="5">
          <el-statistic
            title="账号盈亏"
            :value="accountProfit"
            :precision="0"
            prefix="￥"
          />
        </el-col>
      </el-row>

      <div v-if="account.description" class="tip">
        <el-alert :title="account.description" type="info" show-icon />
      </div>

      <MoneyRiskView :player-id="accountId" />

      <fieldset>
        <legend @click="openCreate">
          充提记录
          <el-button link type="primary" class="am-icon-plus" />
        </legend>
        <el-table
          v-loading="loading"
          :data="logs"
          border
          size="small"
          class="table"
          style="width: 100%"
          :row-class-name="tableRowClass"
        >
          <el-table-column prop="logId" label="ID" width="60" align="center">
            <template #default="{ row }">{{ rowId(row) }}</template>
          </el-table-column>
          <el-table-column label="操作类型" width="100" align="center">
            <template #default="{ row }">
              <label :class="[rowType(row), { auto: rowIsAuto(row) }]">
                {{ typeLabels[rowType(row)] || rowType(row) }}
              </label>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="100" align="center">
            <template #default="{ row }">
              <label :class="['currency', rowCurrency(row)]">{{ rowMoney(row) }}</label>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="150" align="center">
            <template #default="{ row }">{{ formatDate(rowCreateAt(row)) }}</template>
          </el-table-column>
          <el-table-column label="备注信息" align="center">
            <template #default="{ row }">{{ rowDescription(row) || "—" }}</template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                class="am-icon-edit"
                @click="openEdit(row)"
              />
              <el-button
                link
                type="danger"
                class="am-icon-times"
                @click="removeLog(row)"
              />
            </template>
          </el-table-column>
        </el-table>

        <div class="pageSplit flex flex-center">
          <el-pagination
            v-if="total > pageSize"
            background
            layout="prev, pager, next"
            :total="total"
            :page-size="pageSize"
            v-model:current-page="pageIndex"
            @current-change="loadLogs"
          />
        </div>
      </fieldset>
    </div>

    <MoneyInfoDialog
      :open="infoOpen"
      :player-id="accountId"
      :log-id="editLogId"
      @close="infoOpen = false"
      @saved="onInfoSaved"
    />
  </el-dialog>
</template>
