<script setup lang="ts">
import type { PolymarketBuilderTradeRow } from "@/api/admin";
import { computed, ref } from "vue";
import { todayUtcKey } from "@/shared/dateKey";
import {
  aggregateBuilderFeesByDay,
  currentMonthKey,
  formatBarValue,
  maxSeriesValue,
  shiftMonthKey,
  sumDayFeeBuckets,
  type DayFeeBucket,
  type DayFeeSeriesKey,
} from "@/shared/adminPmBuilderFeeChart";
import { toFixed } from "@changmen/client-core/shared/format";

const props = withDefaults(defineProps<{
  trades?: PolymarketBuilderTradeRow[];
  monthKey?: string;
  /** 当前页不是整月数据（日/周），柱只反映已加载成交 */
  partial?: boolean;
  hasMore?: boolean;
}>(), {
  trades: () => [],
  monthKey: "",
  partial: false,
  hasMore: false,
});

const emit = defineEmits<{
  "update:monthKey": [value: string];
}>();

type MetricMode = "fees" | "builderSplit" | "volume" | "count";

type SeriesDef = {
  key: DayFeeSeriesKey;
  label: string;
  color: string;
};

const SERIES: Record<MetricMode, SeriesDef[]> = {
  fees: [
    { key: "builderFeeUsdc", label: "builderFee", color: "#409eff" },
    { key: "feeUsdc", label: "feeUsdc", color: "#e6a23c" },
  ],
  builderSplit: [
    { key: "buyBuilderFeeUsdc", label: "买 builderFee", color: "#67c23a" },
    { key: "sellBuilderFeeUsdc", label: "卖 builderFee", color: "#f56c6c" },
  ],
  volume: [
    { key: "volumeUsdc", label: "成交量 U", color: "#409eff" },
  ],
  count: [
    { key: "tradeCount", label: "笔数", color: "#909399" },
  ],
};

const metricMode = ref<MetricMode>("fees");
const today = todayUtcKey();

const chartMonthKey = computed(() => props.monthKey || currentMonthKey());
const canNextMonth = computed(() => chartMonthKey.value < currentMonthKey());
const series = computed(() => SERIES[metricMode.value]);
const buckets = computed(() =>
  aggregateBuilderFeesByDay(props.trades ?? [], chartMonthKey.value),
);
const totals = computed(() => sumDayFeeBuckets(buckets.value));
const maxValue = computed(() => maxSeriesValue(buckets.value, series.value.map(s => s.key)));
const hasAnyTrade = computed(() => totals.value.tradeCount > 0);

function fmtUsdc(n: number): string {
  return toFixed(n, 2);
}

function barKind(): "money" | "count" {
  return metricMode.value === "count" ? "count" : "money";
}

function barLabel(value: number): string {
  return formatBarValue(value, barKind());
}

function barHeight(value: number): string {
  const max = maxValue.value;
  if (max <= 0 || value <= 0)
    return "0%";
  const pct = (value / max) * 100;
  return `${Math.max(pct, 2)}%`;
}

function dayTitle(row: DayFeeBucket): string {
  return [
    row.key,
    `${row.tradeCount} 笔`,
    `成交量 ${fmtUsdc(row.volumeUsdc)} U`,
    `feeUsdc ${fmtUsdc(row.feeUsdc)}`,
    `builderFee ${fmtUsdc(row.builderFeeUsdc)}`,
    `买 ${fmtUsdc(row.buyBuilderFeeUsdc)} / 卖 ${fmtUsdc(row.sellBuilderFeeUsdc)}`,
  ].join(" · ");
}

function setMonth(key: string) {
  emit("update:monthKey", key);
}

function prevMonth() {
  setMonth(shiftMonthKey(chartMonthKey.value, -1));
}

function nextMonth() {
  if (!canNextMonth.value)
    return;
  setMonth(shiftMonthKey(chartMonthKey.value, 1));
}
</script>

<template>
  <section class="admin-card fee-chart-card">
    <div class="fee-chart-head">
      <h3>归因费用按日（UTC）</h3>
      <div class="fee-chart-controls">
        <el-radio-group v-model="metricMode" size="small">
          <el-radio-button value="fees">
            费用
          </el-radio-button>
          <el-radio-button value="builderSplit">
            builderFee 买卖
          </el-radio-button>
          <el-radio-button value="volume">
            成交量
          </el-radio-button>
          <el-radio-button value="count">
            笔数
          </el-radio-button>
        </el-radio-group>
        <div class="fee-chart-month">
          <el-button size="small" @click="prevMonth">
            上月
          </el-button>
          <el-date-picker
            :model-value="chartMonthKey"
            type="month"
            value-format="YYYY-MM"
            size="small"
            style="width: 128px"
            :clearable="false"
            @update:model-value="(v: string) => v && setMonth(v)"
          />
          <el-button size="small" :disabled="!canNextMonth" @click="nextMonth">
            下月
          </el-button>
        </div>
      </div>
    </div>

    <p class="fee-chart-summary">
      {{ chartMonthKey }}
      · {{ totals.tradeCount }} 笔
      · 成交量 {{ fmtUsdc(totals.volumeUsdc) }} U
      · feeUsdc {{ fmtUsdc(totals.feeUsdc) }}
      · builderFee {{ fmtUsdc(totals.builderFeeUsdc) }}
      · 买 {{ fmtUsdc(totals.buyBuilderFeeUsdc) }} / 卖 {{ fmtUsdc(totals.sellBuilderFeeUsdc) }}
    </p>

    <div class="fee-chart-legend">
      <span v-for="s in series" :key="s.key" class="fee-chart-legend__item">
        <i :style="{ background: s.color }" />
        {{ s.label }}
      </span>
    </div>

    <p v-if="partial" class="fee-chart-hint fee-chart-hint--info">
      当前不是整月窗口，柱只统计本页已加载成交。切换月份会按 UTC 月重新拉取。
    </p>
    <p v-else-if="hasMore" class="fee-chart-hint">
      该月成交可能未拉全，柱状图按已返回数据汇总。
    </p>
    <p v-else-if="!hasAnyTrade" class="fee-chart-empty">
      该时段暂无 Builder 归因成交
    </p>

    <div class="fee-chart" role="img" :aria-label="`${chartMonthKey} 按日柱状图`">
      <div
        v-for="row in buckets"
        :key="row.key"
        class="fee-chart__day"
        :class="{
          'is-today': row.key === today,
          'is-empty': row.tradeCount === 0,
          'is-grouped': series.length > 1,
        }"
        :title="dayTitle(row)"
      >
        <div class="fee-chart__bars">
          <div
            v-for="s in series"
            :key="s.key"
            class="fee-chart__col"
          >
            <span
              class="fee-chart__cap"
              :style="{ color: s.color }"
            >{{ row.tradeCount ? (barLabel(row[s.key]) || "·") : " " }}</span>
            <div class="fee-chart__track">
              <div
                class="fee-chart__bar"
                :style="{ height: barHeight(row[s.key]), background: s.color }"
              />
            </div>
          </div>
        </div>
        <div class="fee-chart__label">
          {{ row.day }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.fee-chart-card {
  padding: 16px;
}

.fee-chart-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.fee-chart-head h3 {
  margin: 0;
  font-size: 14px;
}

.fee-chart-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.fee-chart-month {
  display: flex;
  align-items: center;
  gap: 6px;
}

.fee-chart-summary {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.fee-chart-legend {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.fee-chart-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.fee-chart-legend__item i {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.fee-chart-hint,
.fee-chart-empty {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.fee-chart-hint {
  color: var(--el-color-warning);
}

.fee-chart-hint--info {
  color: var(--el-text-color-secondary);
}

.fee-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  overflow-x: auto;
  padding: 4px 0 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.fee-chart__day {
  flex: 1 0 32px;
  min-width: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.fee-chart__day.is-grouped {
  flex: 1 0 48px;
  min-width: 48px;
}

.fee-chart__bars {
  width: 100%;
  height: 168px;
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 3px;
}

.fee-chart__col {
  flex: 1;
  max-width: 22px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.fee-chart__cap {
  flex: 0 0 16px;
  max-width: 100%;
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 16px;
  text-align: center;
  white-space: nowrap;
  overflow: visible;
}

.fee-chart__track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.fee-chart__bar {
  width: 80%;
  max-width: 16px;
  border-radius: 2px 2px 0 0;
  min-height: 0;
  transition: height 0.3s;
}

.fee-chart__label {
  margin-top: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-variant-numeric: tabular-nums;
}

.fee-chart__day.is-today .fee-chart__label {
  font-weight: 700;
  color: var(--el-color-primary);
}

.fee-chart__day.is-empty .fee-chart__label,
.fee-chart__day.is-empty .fee-chart__cap {
  opacity: 0.4;
  font-weight: 400;
}
</style>
