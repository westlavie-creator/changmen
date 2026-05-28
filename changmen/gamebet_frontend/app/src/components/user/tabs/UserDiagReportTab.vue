<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { monthReport } from "@/api/esport";
import { percent } from "@/shared/format";

interface ReportRow {
  Date?: string | number;
  Profit?: number;
  OrderCount?: number;
  BetMoney?: number;
  Rate?: number;
  Hacked?: number;
  RealProfit?: number;
  Deposit?: number;
  Withdraw?: number;
  Wallet?: number;
}

interface ReportPayload {
  list?: ReportRow[];
  total?: ReportRow;
}

const month = ref(new Date().toISOString().slice(0, 7));
const loading = ref(false);
const report = ref<ReportPayload | null>(null);

const columns: { key: keyof ReportRow; label: string; kind?: "money" | "percent" | "int" }[] = [
  { key: "Profit", label: "盈利", kind: "money" },
  { key: "OrderCount", label: "订单量", kind: "int" },
  { key: "BetMoney", label: "流水", kind: "int" },
  { key: "Rate", label: "利润率", kind: "percent" },
  { key: "Hacked", label: "被黑", kind: "int" },
  { key: "RealProfit", label: "实际利润", kind: "money" },
  { key: "Deposit", label: "充值", kind: "int" },
  { key: "Withdraw", label: "提现", kind: "int" },
  { key: "Wallet", label: "充提差", kind: "money" },
];

const summaryCells = computed(() => {
  const total = report.value?.total ?? {};
  return columns.map((col) => formatCell(total[col.key], col.kind));
});

async function load() {
  loading.value = true;
  try {
    report.value = (await monthReport(month.value)) as ReportPayload;
  } finally {
    loading.value = false;
  }
}

function formatDay(date: string | number | undefined) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date);
  return String(d.getDate()).padStart(2, "0");
}

function formatCell(value: number | string | undefined, kind?: string) {
  const n = Number(value ?? 0);
  if (kind === "percent") return percent(n);
  if (kind === "int" || kind === "money") {
    return Math.round(n).toLocaleString();
  }
  return String(value ?? 0);
}

function cellClass(key: keyof ReportRow, value: number | undefined) {
  if (key === "Hacked" && (value ?? 0) > 0) return "hacked";
  if (["Profit", "Rate", "RealProfit", "Wallet"].includes(key)) {
    if ((value ?? 0) > 0) return "win";
    if ((value ?? 0) < 0) return "lose";
  }
  return "";
}

onMounted(load);
</script>

<template>
  <div class="diag-tab">
    <label class="form-row">
      <span>月份</span>
      <input v-model="month" type="month" @change="load" />
    </label>
    <p v-if="loading" class="diag-tab__muted">加载中…</p>
    <div v-else-if="report?.list?.length" class="report-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>日期</th>
            <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in report.list" :key="i">
            <td>{{ formatDay(row.Date) }}</td>
            <td
              v-for="col in columns"
              :key="col.key"
              :class="cellClass(col.key, Number(row[col.key] ?? 0))"
            >
              {{ formatCell(row[col.key], col.kind) }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>统计</td>
            <td
              v-for="(cell, idx) in summaryCells"
              :key="idx"
              :class="cellClass(columns[idx].key, Number(report.total?.[columns[idx].key] ?? 0))"
            >
              {{ cell }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p v-else class="diag-tab__muted">该月暂无报表数据</p>
  </div>
</template>

<style scoped>
.form-row {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  color: #cbd5e1;
}
.form-row input {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.report-wrap {
  overflow: auto;
  max-height: 52vh;
}
.report-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.report-table th,
.report-table td {
  border: 1px solid #334155;
  padding: 4px 6px;
  text-align: center;
  white-space: nowrap;
}
.report-table tfoot td {
  font-weight: 600;
  background: #0f172a80;
}
.win {
  color: #34d399;
}
.lose {
  color: #f87171;
}
.hacked {
  color: #fbbf24;
}
.diag-tab__muted {
  color: #64748b;
  font-size: 13px;
}
</style>
