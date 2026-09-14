<script setup lang="ts">
import type { TableColumnCtx } from "element-plus";
import type { FootballMonthReportRow } from "@/api/footballOrder";
import { toRef } from "vue";
import { percent } from "@changmen/client-core/shared/format";

const props = withDefaults(
  defineProps<{
    list?: FootballMonthReportRow[];
    total?: FootballMonthReportRow | null;
    loading?: boolean;
  }>(),
  {
    list: () => [],
    total: null,
    loading: false,
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

function formatDay(_row: FootballMonthReportRow, _col: unknown, cellValue: string | number | undefined) {
  if (!cellValue)
    return "—";
  const raw = String(cellValue);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m)
    return m[3];
  const d = new Date(cellValue);
  if (Number.isNaN(d.getTime()))
    return raw;
  return String(d.getDate()).padStart(2, "0");
}

function formatInt(_row: FootballMonthReportRow, _col: unknown, cellValue: number | undefined) {
  return Math.round(Number(cellValue ?? 0)).toLocaleString();
}

function summaryMethod({
  columns,
}: {
  columns: TableColumnCtx<FootballMonthReportRow>[];
  data: FootballMonthReportRow[];
}) {
  const total = totalRef.value ?? {};
  return columns.map((col, index) => {
    const prop = col.property as keyof FootballMonthReportRow | undefined;
    if (index === 0)
      return "统计";
    if (!prop || total[prop] == null)
      return "";
    const val = Number(total[prop] ?? 0);
    if (prop === "Rate")
      return percent(val);
    if (prop === "OrderCount")
      return Math.round(val).toLocaleString();
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
    class="month-report-table month-report-table--admin"
    style="width: 100%"
    show-summary
    :summary-method="summaryMethod"
  >
    <el-table-column prop="Date" label="日期" align="center" width="60" :formatter="formatDay" />
    <el-table-column prop="Profit" label="盈利">
      <template #default="{ row }">
        <div
          class="month-report-table__money"
          :class="moneyCellClass(row.Profit)"
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
          class="month-report-table__money"
          :class="moneyCellClass(row.Rate)"
        >
          {{ percent(row.Rate ?? 0) }}
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
</style>
