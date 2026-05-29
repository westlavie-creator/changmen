<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getPlayerOrder } from "@/api/chat";
import { useAccountStore } from "@/stores/accountStore";
import { executeMoneyRisk, type RiskTag } from "@/shared/moneyRisk";

const props = defineProps<{
  playerId: number;
}>();

const tags = ref<RiskTag[]>([]);

onMounted(async () => {
  const info = await getPlayerOrder({ playerId: props.playerId });
  if (!info) return;
  const account = useAccountStore().findAccount(props.playerId);
  tags.value = executeMoneyRisk({
    MoneyLog: info.logs ?? [],
    Orders: info.orders ?? [],
    Balance: account?.balance ?? 0,
  });
});
</script>

<template>
  <div class="tags">
    <fieldset>
      <legend>风险标签</legend>
      <div class="flex flex-wrap gap-10">
        <el-tag
          v-for="(tag, idx) in tags"
          :key="idx"
          size="large"
          effect="dark"
          :type="tag.level"
        >
          {{ tag.Name }}
        </el-tag>
      </div>
    </fieldset>
  </div>
</template>
