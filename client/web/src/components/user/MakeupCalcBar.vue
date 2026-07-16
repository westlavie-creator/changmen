<script setup lang="ts">
import { computed, reactive } from "vue";
import { percent } from "@changmen/client-core/shared/format";
import { calcMakeupStake } from "@/domain/betting/makeupStakeCalc";

const form = reactive({
  refMoney: undefined as number | undefined,
  refOdds: undefined as number | undefined,
  targetOdds: undefined as number | undefined,
});

const result = computed(() =>
  calcMakeupStake({
    refMoney: Number(form.refMoney) || 0,
    refOdds: Number(form.refOdds) || 0,
    targetOdds: Number(form.targetOdds) || 0,
  }),
);

function fmt(n: number, digits = 0): string {
  return Number.isFinite(n) ? n.toFixed(digits) : "—";
}

function fmtProfit(n: number): string {
  if (!Number.isFinite(n))
    return "—";
  const rounded = Math.round(n * 100) / 100;
  const body = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return rounded > 0 ? `+${body}` : body;
}
</script>

<template>
  <div class="sailor-calc" title="水手公式 · 本地对冲计算">
    <span class="sailor-calc__brand">
      <i class="am-icon-calculator" aria-hidden="true" />
      水手公式
    </span>

    <div class="sailor-calc__fields">
      <div class="sailor-calc__pair">
        <label class="sailor-calc__field">
          <span>已成金额</span>
          <el-input-number
            v-model="form.refMoney"
            :min="0"
            :controls="false"
            :precision="0"
            placeholder="金额"
            size="small"
          />
        </label>
        <label class="sailor-calc__field">
          <span>已成赔率</span>
          <el-input-number
            v-model="form.refOdds"
            :min="1"
            :step="0.01"
            :controls="false"
            :precision="3"
            placeholder="赔率"
            size="small"
          />
        </label>
      </div>
      <label class="sailor-calc__field">
        <span>补单赔率</span>
        <el-input-number
          v-model="form.targetOdds"
          :min="1"
          :step="0.01"
          :controls="false"
          :precision="3"
          placeholder="赔率"
          size="small"
        />
      </label>
      <div class="sailor-calc__out">
        <template v-if="result">
          <span class="sailor-calc__money">
            补单 <strong>{{ result.makeupMoney }}</strong>
          </span>
          <span
            class="sailor-calc__profit"
            :class="{
              'is-gain': result.profitAmount > 0,
              'is-loss': result.profitAmount < 0,
            }"
          >
            利润率 <strong>{{ percent(result.profitRate, 1) }}</strong>
            · 盈利 <strong>{{ fmtProfit(result.profitAmount) }}</strong>
          </span>
          <span class="sailor-calc__meta">
            返还 {{ fmt(result.refReturn) }}/{{ fmt(result.makeupReturn) }}
            <template v-if="result.returnDiff !== 0">
              · 差 {{ result.returnDiff > 0 ? "+" : "" }}{{ fmt(result.returnDiff) }}
            </template>
          </span>
        </template>
        <span v-else class="sailor-calc__hint">填三项即时算</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sailor-calc {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 4px 10px;
  border-radius: 6px;
  background: linear-gradient(90deg, #1e293b99 0%, #0f172a66 100%);
  border: 1px solid #334155aa;
  box-shadow: inset 0 1px 0 #ffffff0a;
}

.sailor-calc__brand {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #7dd3fc;
  white-space: nowrap;
}

.sailor-calc__brand :deep([class*="am-icon-"])::before {
  font-size: 13px;
}

.sailor-calc__fields {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  min-width: 0;
}

.sailor-calc__pair {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
}

.sailor-calc__field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
}

.sailor-calc__field :deep(.el-input-number) {
  width: 88px;
}

.sailor-calc__field :deep(.el-input__wrapper) {
  background: #0b1220cc;
  box-shadow: 0 0 0 1px #475569 inset;
}

.sailor-calc__field :deep(.el-input__inner) {
  color: #e2e8f0;
  text-align: left;
}

.sailor-calc__out {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  white-space: nowrap;
}

.sailor-calc__money {
  font-size: 12px;
  color: #cbd5e1;
}

.sailor-calc__money strong {
  margin-left: 4px;
  font-size: 18px;
  font-weight: 700;
  color: #4ade80;
  font-variant-numeric: tabular-nums;
}

.sailor-calc__profit {
  font-size: 12px;
  color: #cbd5e1;
}

.sailor-calc__profit strong {
  margin-left: 2px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sailor-calc__profit.is-gain strong {
  color: #4ade80;
}

.sailor-calc__profit.is-loss strong {
  color: #f87171;
}

.sailor-calc__meta,
.sailor-calc__hint {
  font-size: 11px;
  color: #64748b;
}
</style>
