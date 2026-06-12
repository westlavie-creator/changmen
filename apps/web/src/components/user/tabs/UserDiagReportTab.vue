<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { TableColumnCtx } from "element-plus";
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

function formatDay(_row: ReportRow, _col: unknown, cellValue: string | number | undefined) {
  if (!cellValue) return "—";
  const d = new Date(cellValue);
  if (Number.isNaN(d.getTime())) return String(cellValue);
  return String(d.getDate()).padStart(2, "0");
}

function formatInt(_row: ReportRow, _col: unknown, cellValue: number | undefined) {
  return Math.round(Number(cellValue ?? 0)).toLocaleString();
}

function summaryMethod({
  columns,
}: {
  columns: TableColumnCtx<ReportRow>[];
  data: ReportRow[];
}) {
  const total = report.value?.total ?? {};
  return columns.map((col, index) => {
    const prop = col.property as keyof ReportRow | undefined;
    if (index === 0) return "统计";
    if (!prop || total[prop] == null) return "";
    const val = Number(total[prop] ?? 0);
    if (prop === "Rate") return percent(val);
    if (["OrderCount", "Deposit", "Withdraw", "Hacked"].includes(prop)) {
      return Math.round(val).toLocaleString();
    }
    return Math.round(val).toLocaleString();
  });
}

async function load() {
  loading.value = true;
  try {
    report.value = (await monthReport(month.value)) as ReportPayload;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <el-form>
    <el-form-item>
      <el-date-picker
        v-model="month"
        type="month"
        placeholder="Pick a month"
        value-format="YYYY-MM"
        @change="load"
      />
    </el-form-item>
  </el-form>

  <el-table
    v-loading="loading"
    :data="report?.list ?? []"
    border
    size="small"
    class="table"
    style="width: 100%"
    show-summary
    :summary-method="summaryMethod"
  >
    <el-table-column prop="Date" label="日期" align="center" width="60" :formatter="formatDay" />
    <el-table-column prop="Profit" label="盈利">
      <template #default="{ row }">
        <div
          class="moneyValue"
          :class="{ win: (row.Profit ?? 0) > 0, lose: (row.Profit ?? 0) < 0 }"
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
          class="moneyValue"
          :class="{ win: (row.Rate ?? 0) > 0, lose: (row.Rate ?? 0) < 0 }"
        >
          {{ percent(row.Rate ?? 0) }}
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="Hacked" label="被黑">
      <template #default="{ row }">
        <div :class="{ hacked: (row.Hacked ?? 0) > 0 }">
          {{ Math.round(row.Hacked ?? 0).toLocaleString() }}
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="RealProfit" label="实际利润">
      <template #default="{ row }">
        <div
          class="moneyValue"
          :class="{ win: (row.RealProfit ?? 0) > 0, lose: (row.RealProfit ?? 0) < 0 }"
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
          class="moneyValue"
          :class="{ win: (row.Wallet ?? 0) > 0, lose: (row.Wallet ?? 0) < 0 }"
        >
          {{ Math.round(row.Wallet ?? 0).toLocaleString() }}
        </div>
      </template>
    </el-table-column>
  </el-table>
</template>
