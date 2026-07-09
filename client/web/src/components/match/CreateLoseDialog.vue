<script setup lang="ts">
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import { storeToRefs } from "pinia";
import { reactive, ref } from "vue";
import { LoseOrder } from "@/models/loseOrder";
import { createLoseTargetOdds } from "@/stores/betting/createLoseOdds";
import { useUserStore } from "@/stores/userStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import "@/styles/lose-order.css";

/** [A8 可证实] CreateLoseView：HomeView v-if 挂载，modelValue 初始 true；setup 时一次性取赔 */
const props = defineProps<{
  match: ViewMatch;
  bet: ViewBet;
}>();

const emit = defineEmits<{ close: [] }>();

const user = useUserStore();
const loseStore = useLoseOrderStore();
const { config } = storeToRefs(user);

const visible = ref(true);

function maxOdds(side: BetSide) {
  return Math.max(...props.bet.items.map(item => item.getOdds(side)));
}

// [A8 可证实] form 含 profit 字段（未展示）；odds 初始 = maxOdds(Home)，切边才 +0.5
const form = reactive({
  target: "Home" as BetSide,
  betMoney: config.value.betMoney,
  profit: config.value.profit,
  odds: maxOdds("Home"),
  betCount: 1,
});

const sides: BetSide[] = ["Home", "Away"];

function onTargetChange() {
  form.odds = createLoseTargetOdds(maxOdds(form.target));
}

function onClosed() {
  emit("close");
}

function confirm() {
  // [A8 可证实] new Ly(..., linkId=0, createAt=void 0, isCreateOrder=true, betCount)
  const order = new LoseOrder({
    accountId: 0,
    matchId: props.match.id,
    betId: props.bet.id,
    target: form.target,
    betMoney: Number(form.betMoney),
    betOdds: Number(form.odds),
    match: props.match.title,
    bet: props.bet.getBetName(),
    linkId: 0,
    isCreateOrder: true,
    betCount: Number(form.betCount) || 1,
  });
  loseStore.createOrder(order);
  emit("close");
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="create-lose-dialog"
    width="400"
    top="5vh"
    title="创建补单队列"
    @closed="onClosed"
  >
    <el-form label-width="60">
      <el-form-item label="比赛:">
        <div v-html="match.title" />
      </el-form-item>
      <el-form-item label="盘口:">
        <div v-html="bet.getBetName()" />
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
            <el-input v-model="form.betMoney" />
          </el-col>
          <el-col :span="1" />
          <el-col :span="4">
            赔率:
          </el-col>
          <el-col :span="5">
            <el-input v-model="form.odds" />
          </el-col>
          <el-col :span="1" />
          <el-col :span="4">
            次数:
          </el-col>
          <el-col :span="4">
            <el-input v-model="form.betCount" />
          </el-col>
        </el-row>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" @click="confirm">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>
