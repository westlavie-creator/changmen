<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useMatchStore } from "@/stores/matchStore";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const matchStore = useMatchStore();
const { userName } = storeToRefs(user);
const { matchCount, loading } = storeToRefs(matchStore);
</script>

<template>
  <header class="app-header flex flex-between flex-middle">
    <div class="app-header__actions flex flex-middle">
      <span class="app-header__meta">{{ userName }} · {{ matchCount }} 场</span>
      <button
        type="button"
        class="el-button el-button--small"
        :disabled="loading"
        @click="matchStore.fetchMatches(true)"
      >
        刷新
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  padding: 8px 14px;
  background: #0006;
  border-bottom: 1px solid #ffffff1a;
  color: #e2e8f0;
}
.app-header__actions {
  gap: 10px;
  margin-left: auto;
}
.app-header__meta {
  font-size: 12px;
  color: #94a3b8;
}
</style>
