<script setup lang="ts">
import type { OrderRow } from "@/types/order";
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { formatDisplayOdds, toFixed } from "@/shared/format";
import { useAccountStore } from "@/stores/accountStore";
import { useOrderStore } from "@/stores/orderStore";
import { sellPolymarketPosition } from "@venue/polymarket/sell";
import type { PmSellQuoteView } from "./pmSellQuotes";
import { pmStakeUsdcFromRow } from "./pmSellQuotes";

const props = defineProps<{
  row: OrderRow;
  quote?: PmSellQuoteView;
  loading?: boolean;
}>();

const selling = ref(false);
const accountStore = useAccountStore();
const orderStore = useOrderStore();

const isOpenPm = computed(() =>
  String(props.row.Type ?? "") === "Polymarket"
  && String(props.row.Status ?? "") === "None",
);

const shares = computed(() => Number(props.row.PmShares) || 0);
const tokenId = computed(() => String(props.row.PmTokenId ?? "").trim());
const canShow = computed(() => isOpenPm.value && tokenId.value && shares.value > 0);

const stakeUsdc = computed(() =>
  pmStakeUsdcFromRow(props.row.PmStakeUsdc, Number(props.row.BetMoney) || 0),
);

async function onSell() {
  const account = accountStore.findAccount(props.row.PlayerID);
  if (!account) {
    ElMessage.error("未找到 Polymarket 账号");
    return;
  }
  const q = props.quote;
  const profitLabel = q
    ? `${q.profitDisplay >= 0 ? "+" : ""}${toFixed(q.profitDisplay, 0)}`
    : "—";
  try {
    await ElMessageBox.confirm(
      `市价卖出 ${toFixed(shares.value, 2)} 份？\n可卖赔率 ${q ? formatDisplayOdds(q.sellOdds) : "—"}，预估浮动盈亏 ${profitLabel}`,
      "Polymarket 平仓",
      { type: "warning", confirmButtonText: "卖出", cancelButtonText: "取消" },
    );
  }
  catch {
    return;
  }

  selling.value = true;
  try {
    const result = await sellPolymarketPosition(account, {
      tokenId: tokenId.value,
      shares: shares.value,
      stakeUsdc: stakeUsdc.value,
    });
    if (!result.success) {
      ElMessage.error(result.message || "卖出失败");
      return;
    }
    ElMessage.success(result.message || "卖出成功");
    await account.updateOrders();
    await orderStore.fetchOrders();
  }
  finally {
    selling.value = false;
  }
}
</script>

<template>
  <div v-if="canShow" class="pm-order-sell">
    <span class="pm-order-sell__quote">
      可卖
      <span class="order__odds">{{
        quote ? formatDisplayOdds(quote.sellOdds) : "—"
      }}</span>
      浮盈
      <span
        class="pm-order-sell__profit"
        :class="{ pos: (quote?.profitDisplay ?? 0) > 0, neg: (quote?.profitDisplay ?? 0) < 0 }"
      >
        {{ quote ? `${quote.profitDisplay >= 0 ? "+" : ""}${toFixed(quote.profitDisplay, 0)}` : "—" }}
      </span>
    </span>
    <el-button
      type="warning"
      size="small"
      plain
      :loading="selling || loading"
      :disabled="!quote || quote.bestBid <= 0"
      @click="onSell"
    >
      卖出
    </el-button>
  </div>
</template>

<style scoped>
.pm-order-sell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.3;
}

.pm-order-sell__quote {
  flex: 1;
  min-width: 0;
  color: var(--el-text-color-secondary, #999);
}

.pm-order-sell__profit.pos {
  color: #67c23a;
}

.pm-order-sell__profit.neg {
  color: #f56c6c;
}
</style>
