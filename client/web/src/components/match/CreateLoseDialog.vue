<script setup lang="ts">
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import { storeToRefs } from "pinia";
import { computed, reactive, ref, watch } from "vue";
import { LoseOrder } from "@/models/loseOrder";
import { createLoseTargetOdds } from "@/stores/betting/createLoseOdds";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/lose-order.css";

const props = defineProps<{
  open: boolean;
  match?: ViewMatch;
  bet?: ViewBet;
}>();

const emit = defineEmits<{ close: [] }>();

const configStore = useConfigStore();
const loseStore = useLoseOrderStore();
const { config } = storeToRefs(configStore);

const visible = ref(false);

let form = reactive({
  target: "Home" as BetSide,
  betMoney: 100,
  odds: 0,
  betCount: 1,
});

const sides: BetSide[] = ["Home", "Away"];

function maxOdds(side: BetSide) {
  if (!props.bet)
    return 0;
  return Math.max(...props.bet.items.map(item => item.getOdds(side)));
}

watch(
  () => props.open,
  (open) => {
    visible.value = open;
  },
  { immediate: true },
);

watch(
  () => [props.open, props.bet] as const,
  ([open, bet]) => {
    if (!open || !bet)
      return;
    form.target = "Home";
    form.betMoney = config.value.betMoney;
    form.odds = maxOdds("Home");
    form.betCount = 1;
  },
  { immediate: true },
);

function onTargetChange() {
  form.odds = createLoseTargetOdds(maxOdds(form.target));
}

function onClosed() {
  emit("close");
}

function confirm() {
  if (!props.match || !props.bet)
    return;
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
  visible.value = false;
  emit("close");
}

const canSubmit = computed(() => Boolean(props.match && props.bet));
</script>

<template>
  <el-dialog
    v-model="visible"
    class="create-lose-dialog"
    width="400"
    title="创建补单队列"
    @closed="onClosed"
  >
    <el-form v-if="canSubmit" label-width="60">
      <el-form-item label="比赛:">
        <div v-html="match!.title" />
      </el-form-item>
      <el-form-item label="盘口:">
        <div v-html="bet!.getBetName()" />
      </el-form-item>
      <el-form-item label="投注:">
        <el-radio-group v-model="form.target" @change="onTargetChange">
          <el-radio v-for="side in sides" :key="side" :value="side">
            {{ side }}({{ maxOdds(side) }})
          </el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="金额:">
        <el-row>
          <el-col :span="4">
            <el-input v-model.number="form.betMoney" />
          </el-col>
          <el-col :span="1" />
          <el-col :span="4">
            赔率:
          </el-col>
          <el-col :span="5">
            <el-input v-model.number="form.odds" />
          </el-col>
          <el-col :span="1" />
          <el-col :span="4">
            次数:
          </el-col>
          <el-col :span="4">
            <el-input v-model.number="form.betCount" />
          </el-col>
        </el-row>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" :disabled="!canSubmit" @click="confirm">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>
