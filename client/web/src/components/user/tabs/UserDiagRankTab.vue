<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getRankList } from "@/api/esport";
import type { UserProfitRow } from "@/types/esport";

const sortBy = ref<"Money" | "Count" | "BetMoney">("Money");
const rows = ref<UserProfitRow[]>([]);
const loading = ref(false);

const sortOptions = [
  { label: "盈利", type: "Money" as const },
  { label: "订单量", type: "Count" as const },
  { label: "流水", type: "BetMoney" as const },
];

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
    rows.value = await getRankList();
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
  <div class="rank flex flex-wrap">
    <div
      v-for="row in sorted"
      :key="row.UserID"
      class="item"
      :class="{ lose: row.Money < 0, boss: isBoss(row), loser: isLoser(row) }"
    >
      <div class="face">
        <div class="name">{{ row.UserName }}</div>
      </div>
      <div class="profit">
        <el-tag round :type="row.Money > 0 ? 'success' : 'danger'">
          {{ metric(row) }}
        </el-tag>
      </div>
    </div>
  </div>
  <div class="flex flex-center">
    <el-button-group size="small">
      <el-button
        v-for="opt in sortOptions"
        :key="opt.type"
        :type="sortBy === opt.type ? 'primary' : 'default'"
        @click="sortBy = opt.type"
      >
        {{ opt.label }}
      </el-button>
    </el-button-group>
  </div>
</template>

<style scoped>
.rank :deep(.item .face) {
  background-image: url(/esport2/assets/rank-sasuke.svg) !important;
}
.rank :deep(.item.boss .face),
.rank :deep(.item.boss .face:hover) {
  background-image: url(/esport2/assets/rank-kurama.svg) !important;
}
.rank :deep(.item.loser .face),
.rank :deep(.item.loser:last-child .face:hover) {
  background-image: url(/esport2/assets/rank-naruto.svg) !important;
}
</style>
