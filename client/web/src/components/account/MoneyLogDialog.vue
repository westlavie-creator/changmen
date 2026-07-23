<script setup lang="ts">
import type { MoneyLogRow } from "@/types/esport";
import { ElMessage } from "element-plus";
import { computed, ref, watch } from "vue";
import { deleteMoneyLog, getMoneyLogs } from "@/api/esport";
import MoneyInfoDialog from "@/components/account/MoneyInfoDialog.vue";
import MoneyRiskView from "@/components/account/MoneyRiskView.vue";
import { Currency, getExchange } from "@/shared/currency";
import { formatDate } from "@changmen/client-core/shared/format";
import { useAccountStore } from "@/stores/accountStore";

/** 对齐 A8 bundle `MoneyView`（fDe） */
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
const riskKey = ref(0);

const account = computed(() => accountStore.findAccount(props.accountId));

/** PredictFun：真余额在 total_balance；A8 授信/充提公式不适用 */
const isPredictFun = computed(
  () => String(account.value?.provider ?? "").trim() === "PredictFun",
);

const title = computed(() => {
  const acc = account.value;
  if (!acc)
    return "充提登记";
  return `${acc.platformName || acc.provider} / ${acc.playerName}`;
});

const typeLabels: Record<string, string> = {
  Recharge: "充值",
  Withdraw: "提现",
  Lose: "被黑",
};

function sumMoney(rows: MoneyLogRow[], type: string) {
  return rows
    .filter(r => (r.Type ?? r.type) === type)
    .reduce(
      (s, r) =>
        s + (Number(r.Money ?? r.money) || 0) * getExchange(r.Currency ?? r.currency),
      0,
    );
}

const rechargeTotal = computed(() => sumMoney(allLogs.value, "Recharge"));
const withdrawTotal = computed(() => sumMoney(allLogs.value, "Withdraw"));

const accountProfit = computed(() => {
  const acc = account.value;
  if (!acc)
    return 0;
  // PF：订单战绩，不走 A8「充提记录 − 授信 + 余额」
  if (isPredictFun.value)
    return Number(acc.totalProfit) || 0;
  const balanceFx
    = (acc.balance ?? 0) * getExchange(acc.currency ?? Currency.CNY);
  return withdrawTotal.value - rechargeTotal.value + balanceFx - (acc.credit ?? 0);
});

function tableRowClass({ row }: { row: MoneyLogRow }) {
  return `row-${row.Type ?? row.type ?? ""}`;
}

async function loadLogs(page = pageIndex.value) {
  if (!props.accountId)
    return;
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
    riskKey.value += 1;
  }
  catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "加载充提记录失败");
  }
  finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    visible.value = open;
    if (open)
      void loadLogs(1);
  },
  { immediate: true },
);

watch(
  () => props.accountId,
  (id) => {
    if (props.open && id)
      void loadLogs(1);
  },
);

function onClosed() {
  emit("close");
}

function openCreate() {
  editLogId.value = undefined;
  infoOpen.value = true;
}

function openEdit(row: MoneyLogRow) {
  editLogId.value = row.ID ?? row.logId;
  infoOpen.value = true;
}

async function removeLog(row: MoneyLogRow) {
  const id = row.ID ?? row.logId;
  if (!id)
    return;
  if (!window.confirm("确认删除吗？"))
    return;
  await deleteMoneyLog({ logId: id });
  await loadLogs(pageIndex.value);
}

function editCredit() {
  const acc = account.value;
  if (!acc || isPredictFun.value)
    return;
  const raw = window.prompt("请输入当前的授信额度", String(acc.credit ?? 0));
  if (!raw || Number.isNaN(Number(raw)))
    return;
  acc.credit = Number(raw);
  void accountStore.saveAccounts();
}

async function onInfoClosed() {
  infoOpen.value = false;
  editLogId.value = undefined;
  await loadLogs(pageIndex.value);
  await accountStore.loadAccounts();
}
</script>

<template>
  <!-- A8 MoneyView：子弹窗 MoneyInfoView 与主 el-dialog 并列，不可嵌套在 dialog 内 -->
  <el-dialog v-model="visible" :title="title" width="800" append-to-body @closed="onClosed">
    <div v-if="account" class="report">
      <el-row>
        <el-col :span="isPredictFun ? 8 : 4">
          <el-statistic
            :title="isPredictFun ? '充值(记)' : '充值'"
            :value="rechargeTotal"
            :precision="0"
            prefix="￥"
          />
        </el-col>
        <el-col :span="isPredictFun ? 8 : 5">
          <el-statistic
            :title="isPredictFun ? '提现(记)' : '提现'"
            :value="withdrawTotal"
            :precision="0"
            prefix="￥"
          />
        </el-col>
        <el-col v-if="!isPredictFun" :span="5">
          <el-statistic
            title="授信额度"
            :value="account.credit ?? 0"
            :precision="0"
            prefix="￥"
            @dblclick="editCredit"
          />
        </el-col>
        <el-col :span="isPredictFun ? 8 : 5">
          <el-statistic
            title="当前余额"
            :value="account.balance ?? 0"
            :precision="isPredictFun ? 2 : 0"
            :prefix="account.currency || (isPredictFun ? 'USDT' : 'CNY')"
          />
        </el-col>
        <el-col v-if="!isPredictFun" :span="5">
          <el-statistic title="账号盈亏" :value="accountProfit" :precision="0" prefix="￥" />
        </el-col>
      </el-row>
      <el-row v-if="isPredictFun" class="pf-pnl">
        <el-col :span="8">
          <el-statistic title="账号盈亏" :value="accountProfit" :precision="2" prefix="USDT " />
        </el-col>
      </el-row>

      <div v-if="isPredictFun" class="tip">
        <el-alert
          title="PredictFun：余额为中转账本真钱；上方充提仅可选备注，不加减余额、无授信。"
          type="info"
          show-icon
          :closable="false"
        />
      </div>
      <div v-if="account.description" class="tip">
        <el-alert :title="account.description" type="info" show-icon />
      </div>

      <MoneyRiskView :key="riskKey" :player-id="accountId" />

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
          <el-table-column prop="ID" label="ID" width="60" align="center" />
          <el-table-column label="操作类型" width="100" align="center">
            <template #default="{ row }">
              <label
                :class="[
                  row.Type ?? row.type,
                  { auto: (row.IsAuto ?? row.isAuto) === 1 },
                ]"
              >
                {{ typeLabels[row.Type ?? row.type ?? ""] || row.Type || row.type }}
              </label>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="100" align="center">
            <template #default="{ row }">
              <label class="currency" :class="[row.Currency ?? row.currency]">
                {{ row.Money ?? row.money }}
              </label>
            </template>
          </el-table-column>
          <el-table-column label="时间" width="150" align="center">
            <template #default="{ row }">
              {{ formatDate(row.CreateAt ?? row.createAt ?? 0) }}
            </template>
          </el-table-column>
          <el-table-column label="备注信息" prop="Description" align="center">
            <template #default="{ row }">
              {{ row.Description ?? row.description ?? row.Remark ?? "—" }}
            </template>
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
            v-model:current-page="pageIndex"
            background
            layout="prev, pager, next"
            :total="total"
            :page-size="pageSize"
            @current-change="loadLogs"
          />
        </div>
      </fieldset>
    </div>
    <el-empty v-else description="账号不存在或已删除" />
  </el-dialog>

  <MoneyInfoDialog
    v-if="infoOpen"
    :open="infoOpen"
    :player-id="accountId"
    :log-id="editLogId"
    @close="onInfoClosed"
    @saved="onInfoClosed"
  />
</template>
