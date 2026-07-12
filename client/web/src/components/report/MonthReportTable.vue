<script setup lang="ts">
import type { TableColumnCtx } from "element-plus";
import type { MonthReportRow } from "@/types/monthReport";
import { toRef } from "vue";
import { percent } from "@changmen/client-core/shared/format";

const props = withDefaults(
  defineProps<{
    list?: MonthReportRow[];
    total?: MonthReportRow | null;
    loading?: boolean;
    /** a8 = 用户中心；admin = 管理后台 */
    variant?: "a8" | "admin";
  }>(),
  {
    list: () => [],
    total: null,
    loading: false,
    variant: "a8",
  },
);

const totalRef = toRef(props, "total");

function moneyCellClass(value: number | undefined) {
  const n = Number(value ?? 0);
  if (n > 0)
    return "win";
  if (n < 0)
    return "lose";
  return "";
}

function formatDay(_row: MonthReportRow, _col: unknown, cellValue: string | number | undefined) {
  if (!cellValue)
    return "—";
  const d = new Date(cellValue);
  if (Number.isNaN(d.getTime()))
    return String(cellValue);
  return String(d.getDate()).padStart(2, "0");
}

function formatInt(_row: MonthReportRow, _col: unknown, cellValue: number | undefined) {
  return Math.round(Number(cellValue ?? 0)).toLocaleString();
}

function summaryMethod({
  columns,
}: {
  columns: TableColumnCtx<MonthReportRow>[];
  data: MonthReportRow[];
}) {
  const total = totalRef.value ?? {};
  return columns.map((col, index) => {
    const prop = col.property as keyof MonthReportRow | undefined;
    if (index === 0)
      return "统计";
    if (!prop || total[prop] == null)
      return "";
    const val = Number(total[prop] ?? 0);
    if (prop === "Rate")
      return percent(val);
    if (["OrderCount", "Deposit", "Withdraw", "Hacked"].includes(prop)) {
      return Math.round(val).toLocaleString();
    }
    return Math.round(val).toLocaleString();
  });
}
</script>

<template>
  <el-table
    v-loading="loading"
    :data="list"
    border
    size="small"
    class="month-report-table"
    :class="variant === 'admin' ? 'month-report-table--admin' : 'table'"
    style="width: 100%"
    show-summary
    :summary-method="summaryMethod"
  >
    <el-table-column prop="Date" label="日期" align="center" width="60" :formatter="formatDay" />
    <el-table-column prop="Profit" label="盈利">
      <template #default="{ row }">
        <div
          :class="[
            variant === 'admin' ? 'month-report-table__money' : 'moneyValue',
            moneyCellClass(row.Profit),
          ]"
        >
          {{ Math.round(row.Profit ?? 0).toLocaleString() }}
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="OrderCount" label="订单量" :formatter="formatInt" />
    <el-table-column prop="BetMoney" label="流水" :formatter="formatInt" />
    <el-table-column prop="Rate" label="利润率">
      <template #default="{ row }">
        <div
          :class="[
            variant === 'admin' ? 'month-report-table__money' : 'moneyValue',
            moneyCellClass(row.Rate),
          ]"
        >
          {{ percent(row.Rate ?? 0) }}
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="Hacked" label="被黑">
      <template #default="{ row }">
        <div
          :class="[
            variant === 'admin' ? 'month-report-table__hacked' : '',
            { hacked: (row.Hacked ?? 0) > 0 },
          ]"
        >
          {{ Math.round(row.Hacked ?? 0).toLocaleString() }}
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="RealProfit" label="实际利润">
      <template #default="{ row }">
        <div
          :class="[
            variant === 'admin' ? 'month-report-table__money' : 'moneyValue',
            moneyCellClass(row.RealProfit),
          ]"
        >
          {{ Math.round(row.RealProfit ?? 0).toLocaleString() }}
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="Deposit" label="充值" :formatter="formatInt" />
    <el-table-column prop="Withdraw" label="提现" :formatter="formatInt" />
    <el-table-column prop="Wallet" label="充提差">
      <template #default="{ row }">
        <div
          :class="[
            variant === 'admin' ? 'month-report-table__money' : 'moneyValue',
            moneyCellClass(row.Wallet),
          ]"
        >
          {{ Math.round(row.Wallet ?? 0).toLocaleString() }}
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>

<style scoped>
.month-report-table--admin :deep(.month-report-table__money.win) {
  color: var(--adm-success, #34d399);
}
.month-report-table--admin :deep(.month-report-table__money.lose) {
  color: var(--adm-danger, #f87171);
}
.month-report-table--admin :deep(.month-report-table__hacked),
.month-report-table--admin :deep(.hacked) {
  color: var(--adm-warning, #fbbf24);
}
</style>
