<script setup lang="ts">
import { computed } from "vue";
import AppDialog from "@/components/ui/AppDialog.vue";
import type { PlatformId } from "@/types/esport";
import { useOddsStore } from "@/stores/oddsStore";
import { formatDate } from "@/shared/format";

const props = defineProps<{
  open: boolean;
  provider?: PlatformId;
  itemIds?: string[];
}>();

const emit = defineEmits<{ close: [] }>();

const oddsStore = useOddsStore();

const title = computed(() => (props.provider ? `${props.provider} - 限红调整` : "限红调整"));

const rows = computed(() => {
  const labels = ["主队", "客队"];
  return (props.itemIds ?? []).map((id, index) => ({
    id,
    label: labels[index] ?? `项${index + 1}`,
    limit: props.provider ? oddsStore.getLimit(props.provider, id) : undefined,
  }));
});

function removeLimit(oddsId: string) {
  if (!props.provider) return;
  oddsStore.deleteLimit(props.provider, oddsId);
}
</script>

<template>
  <AppDialog :open="open" :title="title" width="420px" @close="emit('close')">
    <div v-if="provider && itemIds?.length" class="limit-list">
      <div v-for="row in rows" :key="row.id" class="limit-row flex flex-middle">
        <span class="limit-label">{{ row.label }}</span>
        <span class="limit-value">
          限红金额: {{ row.limit ? row.limit.value.toFixed(2) : "—" }}
        </span>
        <span class="limit-expire">
          过期时间: {{ row.limit?.expireTime ? formatDate(row.limit.expireTime) : "N/A" }}
        </span>
        <button
          type="button"
          class="limit-del"
          :disabled="!row.limit"
          title="删除限红"
          @click="removeLimit(row.id)"
        >
          ×
        </button>
      </div>
    </div>
    <p v-else class="limit-empty">暂无限红数据</p>
  </AppDialog>
</template>

<style scoped>
.limit-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.limit-row {
  gap: 8px;
  font-size: 13px;
  padding: 6px 0;
  border-bottom: 1px solid #334155;
}
.limit-label {
  width: 40px;
  color: #94a3b8;
  flex-shrink: 0;
}
.limit-value,
.limit-expire {
  flex: 1;
  min-width: 0;
}
.limit-del {
  width: 28px;
  height: 28px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #7f1d1d;
  color: #fecaca;
  cursor: pointer;
  flex-shrink: 0;
}
.limit-del:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.limit-empty {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}
</style>
