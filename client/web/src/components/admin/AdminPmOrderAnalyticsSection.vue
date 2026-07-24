<script setup lang="ts">
import type { PolymarketOrderAnalyticsPayload } from "@/api/admin";
import { computed, ref } from "vue";
import { toFixed } from "@changmen/client-core/shared/format";
import { pmCnyToUsdc } from "@/shared/pmOrderDisplay";

const props = defineProps<{
  data: PolymarketOrderAnalyticsPayload | null | undefined;
}>();

const PRICE_BANDS = ["0.00-0.30", "0.30-0.50", "0.50-0.70", "0.70-1.00", "unknown"] as const;

const filterProvider = ref("");

const summary = computed(() => props.data?.summary ?? null);
const priceBands = computed(() => props.data?.priceBands ?? []);
const venues = computed(() => props.data?.venues ?? []);

const otherProviders = computed(() => {
  const set = new Set<string>();
  for (const row of venues.value)
    set.add(row.other_provider);
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
});

const priceBandRows = computed(() => {
  const byBand = new Map(priceBands.value.map(r => [r.price_band, r]));
  return PRICE_BANDS
    .map((band) => {
      const row = byBand.get(band);
      return {
        band,
        groupCount: row?.group_count ?? 0,
        winCount: row?.win_count ?? 0,
        loseCount: row?.lose_count ?? 0,
        winRate: row?.win_rate ?? 0,
        pmBet: pmCnyToUsdc(row?.pm_bet ?? 0),
        holdProfit: pmCnyToUsdc(row?.hold_profit ?? 0),
        avgFill: row?.avg_fill_price ?? 0,
        roi: row?.roi ?? 0,
      };
    })
    .filter(r => r.band !== "unknown" || r.groupCount > 0);
});

const venueRows = computed(() => {
  let rows = [...venues.value];
  if (filterProvider.value)
    rows = rows.filter(r => r.other_provider === filterProvider.value);
  return rows.map(r => ({
    provider: r.other_provider,
    groupCount: r.group_count,
    winCount: r.win_count,
    loseCount: r.lose_count,
    winRate: r.win_rate,
    pmBet: pmCnyToUsdc(r.pm_bet),
    holdProfit: pmCnyToUsdc(r.hold_profit),
    avgFill: r.avg_fill_price,
    roi: r.roi,
  }));
});

/** Poly Builder 页统一 U；RDS analytics 存 CNY，展示前已换算 */
function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n))
    return "-";
  return toFixed(n, 2);
}

const summaryUsdc = computed(() => {
  const s = summary.value;
  if (!s)
    return null;
  return {
    ...s,
    totalPmBet: pmCnyToUsdc(s.totalPmBet),
    totalHoldProfit: pmCnyToUsdc(s.totalHoldProfit),
  };
});

function fmtRoi(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n))
    return "-";
  return `${toFixed(n * 100, 1)}%`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n))
    return "-";
  return `${toFixed(n * 100, 1)}%`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0)
    return "-";
  return toFixed(n, 3);
}

function profitClass(n: number): string {
  if (n > 0)
    return "text-green";
  if (n < 0)
    return "text-red";
  return "";
}

const hasData = computed(() => (summary.value?.groupCount ?? 0) > 0);
</script>

<template>
  <section class="admin-card table-section pm-analytics">
    <div class="section-head">
      <h3>changmen Polymarket 策略分析</h3>
      <el-select
        v-if="otherProviders.length"
        v-model="filterProvider"
        clearable
        placeholder="全部对手平台"
        size="small"
        style="width: 140px"
      >
        <el-option
          v-for="p in otherProviders"
          :key="p"
          :label="p"
          :value="p"
        />
      </el-select>
    </div>

    <p class="section-hint">
      持仓到期视角：输赢用赛果字段 pmMatchResult（含中途卖出单）；理论 ROI = 假使拿到结算的盈亏 / PM 本金，不影响实际卖出盈亏统计。
      旧单无赛果时回退 Status=Win/Lose。
    </p>

    <div v-if="!hasData" class="analytics-empty">
      该时段暂无已出赛果的 Polymarket 买单组（需同步写入 pmMatchResult）
    </div>

    <template v-else>
      <div class="summary-grid">
        <div class="stat">
          <div class="stat__label">
            已出赛果组数
          </div>
          <div class="stat__value">
            {{ summaryUsdc!.groupCount }}
          </div>
          <div class="stat__sub">
            套利 {{ summaryUsdc!.arbGroupCount }} · 单边 {{ summaryUsdc!.singleLegCount }}
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">
            赛果胜率
          </div>
          <div class="stat__value">
            {{ fmtPct(summaryUsdc!.winRate) }}
          </div>
          <div class="stat__sub">
            {{ summaryUsdc!.winCount }} 赢 / {{ summaryUsdc!.loseCount }} 输
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">
            理论持有 ROI
          </div>
          <div class="stat__value" :class="profitClass(summaryUsdc!.totalHoldProfit)">
            {{ fmtRoi(summaryUsdc!.roi) }}
          </div>
          <div class="stat__sub">
            盈亏 {{ fmtMoney(summaryUsdc!.totalHoldProfit) }} U
          </div>
        </div>
        <div class="stat">
          <div class="stat__label">
            PM 本金 U
          </div>
          <div class="stat__value">
            {{ fmtMoney(summaryUsdc!.totalPmBet) }}
          </div>
          <div class="stat__sub">
            含中途卖光 {{ summaryUsdc!.soldCloseCount }} 组
          </div>
        </div>
      </div>

      <h4 class="sub-title">
        买入价位带 · 赛果 / 理论 ROI
      </h4>
      <el-table :data="priceBandRows" stripe size="small" empty-text="无价位带数据">
        <el-table-column prop="band" label="买入价" width="110" />
        <el-table-column label="组数" width="60" align="right">
          <template #default="{ row }">
            {{ row.groupCount || "" }}
          </template>
        </el-table-column>
        <el-table-column label="胜率" width="70" align="right">
          <template #default="{ row }">
            {{ row.groupCount ? fmtPct(row.winRate) : "" }}
          </template>
        </el-table-column>
        <el-table-column label="赢/输" width="70" align="right">
          <template #default="{ row }">
            <span v-if="row.groupCount">
              <span class="text-green">{{ row.winCount }}</span>
              /
              <span class="text-red">{{ row.loseCount }}</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="PM本金 U" width="90" align="right">
          <template #default="{ row }">
            {{ row.groupCount ? fmtMoney(row.pmBet) : "" }}
          </template>
        </el-table-column>
        <el-table-column label="理论盈亏 U" width="100" align="right">
          <template #default="{ row }">
            <span v-if="row.groupCount" :class="profitClass(row.holdProfit)">
              {{ fmtMoney(row.holdProfit) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="理论ROI" width="80" align="right">
          <template #default="{ row }">
            <span v-if="row.groupCount" :class="profitClass(row.holdProfit)">
              {{ fmtRoi(row.roi) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="均价" width="70" align="right">
          <template #default="{ row }">
            {{ row.groupCount ? fmtPrice(row.avgFill) : "" }}
          </template>
        </el-table-column>
      </el-table>

      <h4 class="sub-title">
        对手场馆 · 赛果 / 理论 ROI
      </h4>
      <el-table :data="venueRows" stripe size="small" empty-text="暂无带对手场馆且已出赛果的组">
        <el-table-column prop="provider" label="对手场馆" min-width="100" />
        <el-table-column label="组数" width="60" align="right">
          <template #default="{ row }">
            {{ row.groupCount }}
          </template>
        </el-table-column>
        <el-table-column label="胜率" width="70" align="right">
          <template #default="{ row }">
            {{ fmtPct(row.winRate) }}
          </template>
        </el-table-column>
        <el-table-column label="赢/输" width="70" align="right">
          <template #default="{ row }">
            <span class="text-green">{{ row.winCount }}</span>
            /
            <span class="text-red">{{ row.loseCount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="PM本金 U" width="90" align="right">
          <template #default="{ row }">
            {{ fmtMoney(row.pmBet) }}
          </template>
        </el-table-column>
        <el-table-column label="理论盈亏 U" width="100" align="right">
          <template #default="{ row }">
            <span :class="profitClass(row.holdProfit)">{{ fmtMoney(row.holdProfit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="理论ROI" width="80" align="right">
          <template #default="{ row }">
            <span :class="profitClass(row.holdProfit)">{{ fmtRoi(row.roi) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="PM均价" width="70" align="right">
          <template #default="{ row }">
            {{ fmtPrice(row.avgFill) }}
          </template>
        </el-table-column>
      </el-table>
    </template>
  </section>
</template>

<style scoped>
.pm-analytics {
  margin-top: 0;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.section-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.section-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 8px;
}

.stat {
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}

.stat__label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.stat__value {
  margin-top: 4px;
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat__sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sub-title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.text-green {
  color: #67c23a;
}

.text-red {
  color: #f56c6c;
}

.analytics-empty {
  text-align: center;
  padding: 20px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
