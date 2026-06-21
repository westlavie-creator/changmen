<script setup lang="ts">
import type { PlatformId } from "@/types/esport";
import { computed, ref, watch } from "vue";
import { formatDate } from "@/shared/format";
import { useOddsStore } from "@/stores/oddsStore";

const props = defineProps<{
  open: boolean;
  provider?: PlatformId;
  itemIds?: string[];
}>();

const emit = defineEmits<{ close: [] }>();

const oddsStore = useOddsStore();
const visible = ref(false);

const title = computed(() => (props.provider ? `${props.provider} - 限红调整` : "限红调整"));

const rows = computed(() => {
  const labels = ["主队", "客队"];
  return (props.itemIds ?? []).map((id, index) => ({
    id,
    label: labels[index] ?? `项${index + 1}`,
    limit: props.provider ? oddsStore.getLimit(props.provider, id) : undefined,
  }));
});

watch(
  () => props.open,
  (open) => {
    visible.value = open;
  },
  { immediate: true },
);

function onClosed() {
  emit("close");
}

function removeLimit(oddsId: string) {
  if (!props.provider)
    return;
  oddsStore.deleteLimit(props.provider, oddsId);
}
</script>

<template>
  <el-dialog
    v-if="provider && itemIds?.length"
    v-model="visible"
    :title="title"
    width="420px"
    @closed="onClosed"
  >
    <div
      v-for="row in rows"
      :key="row.id"
      class="items flex"
    >
      <div class="item">
        {{ row.label }}
      </div>
      <div class="item flex-1">
        限红金额: {{ row.limit ? row.limit.value.toFixed(2) : "—" }}
      </div>
      <div class="item flex-1">
        过期时间: {{ row.limit?.expireTime ? formatDate(row.limit.expireTime) : "N/A" }}
      </div>
      <div class="item">
        <el-button
          size="small"
          type="danger"
          class="am-icon-times"
          :disabled="!row.limit"
          @click="removeLimit(row.id)"
        />
      </div>
    </div>
  </el-dialog>
</template>
