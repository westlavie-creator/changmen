<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getUserProfit } from "@/api/esport";
import type { UserProfitRow } from "@/types/esport";

const sortBy = ref<"Money" | "Count" | "BetMoney">("Money");
const rows = ref<UserProfitRow[]>([]);
const loading = ref(false);

const topUserId = computed(() => {
  const top = [...rows.value].sort((a, b) => b.Money - a.Money)[0];
  if (!top || top.Money < 0) return undefined;
  return top.UserID;
});

const sorted = computed(() => {
  const list = [...rows.value];
  if (sortBy.value === "Money") {
    return list.sort((a, b) => b.Money - a.Money);
  }
  if (sortBy.value === "Count") {
    return list.filter((r) => r.Count).sort((a, b) => (b.Count ?? 0) - (a.Count ?? 0));
  }
  return list.filter((r) => r.BetMoney).sort((a, b) => (b.BetMoney ?? 0) - (a.BetMoney ?? 0));
});

async function load() {
  loading.value = true;
  try {
    rows.value = await getUserProfit();
  } finally {
    loading.value = false;
  }
}

function metric(row: UserProfitRow) {
  if (sortBy.value === "Money") return Math.floor(row.Money).toLocaleString();
  if (sortBy.value === "Count") return String(row.Count ?? 0);
  return Math.floor(row.BetMoney ?? 0).toLocaleString();
}

function isBoss(row: UserProfitRow) {
  return row.UserID === topUserId.value;
}

function isLoser(row: UserProfitRow) {
  return row.Money < 0;
}

onMounted(load);
</script>

<template>
  <div class="diag-tab">
    <div class="rank-list">
      <div
        v-for="row in sorted"
        :key="row.UserID"
        class="rank-item"
        :class="{ lose: isLoser(row), boss: isBoss(row), loser: isLoser(row) }"
      >
        <div class="rank-item__face">
          <div class="rank-item__name">{{ row.UserName }}</div>
        </div>
        <div class="rank-item__profit">
          <span class="rank-tag" :class="row.Money > 0 ? 'rank-tag--win' : 'rank-tag--lose'">
            {{ metric(row) }}
          </span>
        </div>
      </div>
      <p v-if="!loading && !rows.length" class="diag-tab__muted">暂无排行数据</p>
    </div>
    <div class="rank-toolbar">
      <button
        v-for="opt in [
          ['Money', '盈利'],
          ['Count', '订单量'],
          ['BetMoney', '流水'],
        ]"
        :key="opt[0]"
        type="button"
        class="mini-btn"
        :class="{ 'mini-btn--on': sortBy === opt[0] }"
        @click="sortBy = opt[0] as typeof sortBy"
      >
        {{ opt[1] }}
      </button>
      <button type="button" class="mini-btn" :disabled="loading" @click="load">刷新</button>
    </div>
  </div>
</template>

<style scoped>
.rank-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.rank-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 140px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #0f172a80;
  border: 1px solid #334155;
}
.rank-item.boss {
  border-color: #fbbf24;
  box-shadow: 0 0 0 1px #fbbf2444;
}
.rank-item.loser {
  opacity: 0.85;
}
.rank-item__name {
  font-size: 13px;
  color: #e2e8f0;
}
.rank-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
}
.rank-tag--win {
  background: #065f46;
  color: #6ee7b7;
}
.rank-tag--lose {
  background: #7f1d1d;
  color: #fca5a5;
}
.rank-toolbar {
  display: flex;
  justify-content: center;
  gap: 6px;
}
.mini-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
}
.mini-btn--on {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}
.diag-tab__muted {
  color: #64748b;
  font-size: 13px;
  width: 100%;
}
</style>
