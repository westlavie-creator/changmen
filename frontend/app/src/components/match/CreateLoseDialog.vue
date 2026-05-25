<script setup lang="ts">
import { reactive, watch } from "vue";
import { storeToRefs } from "pinia";
import AppDialog from "@/components/ui/AppDialog.vue";
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import { LoseOrder } from "@/models/loseOrder";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

const props = defineProps<{
  open: boolean;
  match?: ViewMatch;
  bet?: ViewBet;
}>();

const emit = defineEmits<{ close: [] }>();

const configStore = useConfigStore();
const loseStore = useLoseOrderStore();
const { config } = storeToRefs(configStore);

const form = reactive({
  target: "Home" as BetSide,
  betMoney: 100,
  odds: 0,
  betCount: 1,
});

function maxOdds(side: BetSide) {
  if (!props.bet) return 0;
  return Math.max(...props.bet.items.map((item) => item.getOdds(side)));
}

watch(
  () => [props.open, props.bet] as const,
  ([open, bet]) => {
    if (!open || !bet) return;
    form.target = "Home";
    form.betMoney = config.value.betMoney;
    form.odds = maxOdds("Home");
    form.betCount = 1;
  },
  { immediate: true },
);

function onTargetChange() {
  form.odds = maxOdds(form.target);
}

function confirm() {
  if (!props.match || !props.bet) return;
  const order = new LoseOrder({
    accountId: 0,
    matchId: props.match.id,
    betId: props.bet.id,
    target: form.target,
    betMoney: form.betMoney,
    betOdds: form.odds,
    match: props.match.title,
    bet: props.bet.getBetName(),
    linkId: 0,
    createAt: Date.now(),
    isCreateOrder: true,
    betCount: form.betCount,
  });
  loseStore.createOrder(order);
  emit("close");
}
</script>

<template>
  <AppDialog :open="open" title="创建补单队列" width="400px" @close="emit('close')">
    <div v-if="match && bet" class="lose-form">
      <label class="lose-row">
        <span>比赛</span>
        <div class="lose-html" v-html="match.title" />
      </label>
      <label class="lose-row">
        <span>盘口</span>
        <div>{{ bet.getBetName() }}</div>
      </label>
      <fieldset class="lose-fieldset">
        <legend>投注方向</legend>
        <label v-for="side in (['Home', 'Away'] as BetSide[])" :key="side" class="lose-radio">
          <input
            v-model="form.target"
            type="radio"
            name="lose-target"
            :value="side"
            @change="onTargetChange"
          />
          {{ side === "Home" ? "主队" : "客队" }} ({{ maxOdds(side) }})
        </label>
      </fieldset>
      <label class="lose-row">
        <span>金额</span>
        <input v-model.number="form.betMoney" type="number" min="1" step="1" />
      </label>
      <label class="lose-row">
        <span>赔率</span>
        <input v-model.number="form.odds" type="number" min="1" step="0.01" />
      </label>
      <label class="lose-row">
        <span>次数</span>
        <input v-model.number="form.betCount" type="number" min="1" step="1" />
      </label>
    </div>
    <template #footer>
      <button type="button" class="btn btn--ghost" @click="emit('close')">取消</button>
      <button type="button" class="btn btn--primary" @click="confirm">确定</button>
    </template>
  </AppDialog>
</template>

<style scoped>
.lose-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}
.lose-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 8px;
  align-items: start;
}
.lose-row span {
  color: #94a3b8;
}
.lose-row input {
  padding: 6px 8px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
}
.lose-fieldset {
  border: 1px solid #475569;
  border-radius: 4px;
  padding: 8px 10px;
  margin: 0;
}
.lose-fieldset legend {
  padding: 0 4px;
  font-size: 12px;
  color: #94a3b8;
}
.lose-radio {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 12px;
  cursor: pointer;
}
.lose-html :deep(*) {
  margin: 0;
}
.btn {
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid #475569;
  cursor: pointer;
  font-size: 13px;
}
.btn--ghost {
  background: transparent;
  color: #cbd5e1;
}
.btn--primary {
  background: #059669;
  border-color: #059669;
  color: #fff;
}
</style>
