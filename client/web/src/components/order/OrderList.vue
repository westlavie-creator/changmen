<script setup lang="ts">
import { ElMessage, ElMessageBox } from "element-plus";
import type { OrderRow } from "@/types/order";
import { onUnmounted, ref } from "vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";
import { rebindOrderLink } from "@/api/order";
import { formatDisplayOdds, formatLinkId, formatOrderTime, toFixed } from "@changmen/client-core/shared/format";
import {
  clobPriceFromDecimalOdds,
  clobPriceFromFoOddsEntry,
  formatPolymarketApiDecimal,
  isPmBuyOrderListRow,
  isPmOrderListRow,
  isPmSellOrderListRow,
  pmBuyLifecycleTagText,
  pmOddsTextFromClobPrice,
  pmOrderFillPriceText,
  pmOrderOddsText,
  pmOrderSharesText,
  resolvePmOrderListStatusClass,
} from "@/shared/pmOrderDisplay";
import {
  isArbGroup,
  orderLegendModifier,
  orderLegendText,
} from "@/shared/orderDisplay";
import { groupHasUnboundPlaceholder } from "@/shared/linkDisplay";
import {
  canRebindOrderLinkTo,
  isMakeupCancelledOrderRow,
  isMakeupPendingOrderRow,
  isRebindableOrderRow,
  makeupBetIdFromPendingRow,
  makeupPendingProfitLabel,
  orderListDisplayRows,
} from "@/shared/orderLink";
import {
  canManualSellPmBuy,
  confirmAndSellPmBuyOrder,
  isPmManualSellInFlight,
} from "@/stores/account/pmManualSell";
import { useOddsStore } from "@/stores/oddsStore";
import { useSportOddsStore } from "@/stores/sportOddsStore";
import { PLATFORMS } from "@changmen/venue-adapter/shared";

export type OrderListEntry = readonly [number, OrderRow[]];

const props = withDefaults(
  defineProps<{
    orderEntries: ReadonlyArray<OrderListEntry>;
    loading?: boolean;
    playerLabel?: (row: OrderRow) => string;
    platformClass?: (row: OrderRow) => string | undefined;
    /** [changmen 扩展] 用户侧栏允许场馆徽章拖放改绑 Link */
    allowLinkRebind?: boolean;
    /** [changmen 扩展] PM 买单行显示「卖出」 */
    allowPmSell?: boolean;
  }>(),
  {
    loading: false,
    playerLabel: () => "",
    platformClass: () => undefined,
    allowLinkRebind: false,
    allowPmSell: false,
  },
);

const emit = defineEmits<{
  cancelMakeup: [betId: number];
  linkRebindDone: [];
}>();

type DragState = {
  orderId: string;
  fromLink: number;
  pointerId: number;
};

const drag = ref<DragState | null>(null);
const dropTargetOrderId = ref<string | null>(null);
let lineEl: SVGSVGElement | null = null;
let startEl: HTMLElement | null = null;

function isPendingRow(row: OrderRow): boolean {
  if (isMakeupPendingOrderRow(row) || isMakeupCancelledOrderRow(row))
    return false;
  return String(row.Status ?? "") === "None";
}

function statusClass(row: OrderRow): string {
  return resolvePmOrderListStatusClass(row);
}

function showPmSellButton(row: OrderRow): boolean {
  return props.allowPmSell && canManualSellPmBuy(row);
}

const oddsStore = useOddsStore();
const sportOddsStore = useSportOddsStore();

/**
 * 未结算买单实时价：只读、不写 fo。
 * 与盘口同源：fo.clobPrice → fo.odds→价；体育盘口价在 sportOddsStore（不进 fo）。
 */
function pmLiveClobPrice(row: OrderRow): number | null {
  void oddsStore.foRevision;
  void sportOddsStore.tick;
  const tokenId = String(row.PmTokenId ?? "").trim();
  if (!tokenId)
    return null;
  const fromFo = clobPriceFromFoOddsEntry(
    oddsStore.getEntry(PLATFORMS.Polymarket, tokenId),
  );
  if (fromFo != null)
    return fromFo;
  return clobPriceFromDecimalOdds(sportOddsStore.get(PLATFORMS.Polymarket, tokenId));
}

/** 可卖持仓显示「当前价」（含 0.99 判赢仍 open；官方 settled 后隐藏） */
function pmShowLivePrice(row: OrderRow): boolean {
  if (!isPmBuyOrderListRow(row) || pmBuyLifecycleTagText(row))
    return false;
  const status = String(row.Status ?? "").trim().toLowerCase();
  if (status === "reject" || status === "return" || status === "pending")
    return false;
  if (row.PmSellState === "closed" || row.PmSellState === "settled")
    return false;
  return pmLiveClobPrice(row) != null;
}

function pmLivePriceText(row: OrderRow): string {
  const live = pmLiveClobPrice(row);
  return live != null ? formatPolymarketApiDecimal(live) : "";
}

/** 最后一行赔率：有当前价则跟当前价，否则跟买入价 */
function pmLastLineOddsText(row: OrderRow): string {
  const live = pmLiveClobPrice(row);
  if (pmShowLivePrice(row) && live != null)
    return pmOddsTextFromClobPrice(live);
  return pmOrderOddsText(row);
}

async function onPmSell(row: OrderRow) {
  await confirmAndSellPmBuyOrder(row);
}

function pmStakeLabel(row: OrderRow): string {
  return isPmSellOrderListRow(row) ? "回款" : "投注金额";
}

function onCancelMakeup(row: OrderRow) {
  const betId = makeupBetIdFromPendingRow(row);
  if (!betId)
    return;
  ElMessageBox.confirm("确认要取消补单吗？", "补单取消", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(() => {
      emit("cancelMakeup", betId);
    })
    .catch(() => {});
}

function shortOrderId(id: string): string {
  const s = String(id || "");
  if (s.length <= 10)
    return s;
  return `…${s.slice(-8)}`;
}

function stripOrderText(raw: string | null | undefined): string {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || "—";
}

function findOrderRowById(orderId: string): OrderRow | null {
  const id = String(orderId || "");
  for (const [, rows] of props.orderEntries) {
    for (const row of orderListDisplayRows(rows)) {
      if (String(row.OrderID) === id)
        return row;
    }
  }
  return null;
}

function formatRebindOrderBlock(label: string, row: OrderRow): string {
  const platform = String(row.Type || "—");
  const player = props.playerLabel(row) || String(row.Player?.UserName || "").trim() || "—";
  const lines = [
    `【${label}】${platform} / ${player}`,
    `订单：${shortOrderId(String(row.OrderID ?? ""))}`,
    `对阵：${stripOrderText(row.Match)}`,
    `盘口：${stripOrderText(row.Bet)}`,
    `选项：${stripOrderText(row.Item)}`,
    `金额：${toFixed(Number(row.BetMoney) || 0, 0)}  赔率：${formatDisplayOdds(Number(row.Odds) || 0)}`,
    `Link：${formatLinkId(row.Link)}`,
  ];
  return lines.join("\n");
}

function clearDragUi() {
  drag.value = null;
  dropTargetOrderId.value = null;
  startEl = null;
  if (lineEl) {
    lineEl.remove();
    lineEl = null;
  }
  document.body.classList.remove("order-link-rebind-dragging");
}

function ensureLine() {
  if (lineEl)
    return lineEl;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("order-link-rebind-line");
  svg.setAttribute("aria-hidden", "true");
  Object.assign(svg.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "9998",
  });
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("stroke", "#7ec8ff");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-dasharray", "4 3");
  svg.appendChild(path);
  document.body.appendChild(svg);
  lineEl = svg;
  return svg;
}

function updateLine(x1: number, y1: number, x2: number, y2: number) {
  const svg = ensureLine();
  const path = svg.querySelector("path");
  if (!path)
    return;
  path.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);
}

function findDropRow(el: EventTarget | null): OrderRow | null {
  const node = el instanceof Element ? el : null;
  const badge = node?.closest?.("[data-rebind-order-id]") as HTMLElement | null;
  if (!badge)
    return null;
  const orderId = badge.dataset.rebindOrderId || "";
  if (!orderId || !drag.value || orderId === drag.value.orderId)
    return null;
  for (const [, rows] of props.orderEntries) {
    for (const row of orderListDisplayRows(rows)) {
      if (String(row.OrderID) === orderId && isRebindableOrderRow(row)) {
        if (!canRebindOrderLinkTo(drag.value.fromLink, row.Link))
          return null;
        return row;
      }
    }
  }
  return null;
}

function onBadgePointerDown(e: PointerEvent, row: OrderRow) {
  if (!props.allowLinkRebind || !isRebindableOrderRow(row))
    return;
  if (e.button !== 0)
    return;
  e.preventDefault();
  e.stopPropagation();
  const orderId = String(row.OrderID);
  const fromLink = Number(row.Link);
  const target = e.currentTarget as HTMLElement;
  startEl = target;
  target.setPointerCapture(e.pointerId);
  drag.value = {
    orderId,
    fromLink,
    pointerId: e.pointerId,
  };
  document.body.classList.add("order-link-rebind-dragging");
  const rect = target.getBoundingClientRect();
  updateLine(rect.left + rect.width / 2, rect.top + rect.height / 2, e.clientX, e.clientY);
}

function onBadgePointerMove(e: PointerEvent) {
  if (!drag.value || e.pointerId !== drag.value.pointerId)
    return;
  if (startEl) {
    const rect = startEl.getBoundingClientRect();
    updateLine(rect.left + rect.width / 2, rect.top + rect.height / 2, e.clientX, e.clientY);
  }
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const row = findDropRow(over);
  dropTargetOrderId.value = row ? String(row.OrderID) : null;
}

async function finishRebind(source: DragState, target: OrderRow) {
  const sourceRow = findOrderRowById(source.orderId);
  if (!sourceRow)
    return;
  const fromLabel = formatLinkId(source.fromLink);
  const toLabel = formatLinkId(target.Link);
  const message = [
    "确认将下列订单改绑到同一 Link？（新→老）",
    "",
    formatRebindOrderBlock("源订单（改绑）", sourceRow),
    "",
    formatRebindOrderBlock("目标订单（承接 Link）", target),
    "",
    `Link：${fromLabel} → ${toLabel}`,
    "请核对对阵与盘口是否为同一场同一地图。此操作写入服务器。",
  ].join("\n");
  try {
    await ElMessageBox.confirm(
      message,
      "改绑订单 Link",
      {
        confirmButtonText: "确定改绑",
        cancelButtonText: "取消",
        type: "warning",
        customClass: "order-link-rebind-confirm",
      },
    );
  }
  catch {
    return;
  }
  try {
    await rebindOrderLink({
      orderId: source.orderId,
      toLinkId: Number(target.Link),
    });
    ElMessage.success("Link 已改绑");
    emit("linkRebindDone");
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : "改绑失败");
  }
}

function onBadgePointerUp(e: PointerEvent) {
  if (!drag.value || e.pointerId !== drag.value.pointerId)
    return;
  const source = drag.value;
  const over = document.elementFromPoint(e.clientX, e.clientY);
  const target = findDropRow(over);
  clearDragUi();
  if (target)
    void finishRebind(source, target);
}

function onBadgePointerCancel(e: PointerEvent) {
  if (!drag.value || e.pointerId !== drag.value.pointerId)
    return;
  clearDragUi();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && drag.value)
    clearDragUi();
}

if (typeof window !== "undefined")
  window.addEventListener("keydown", onKeydown);

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  clearDragUi();
});

function badgeClass(row: OrderRow): Record<string, boolean> {
  const id = String(row.OrderID);
  const rebindable = props.allowLinkRebind && isRebindableOrderRow(row);
  const dragging = drag.value?.orderId === id;
  const dropOk = dropTargetOrderId.value === id;
  const dropBlocked = !!(
    drag.value
    && rebindable
    && id !== drag.value.orderId
    && !canRebindOrderLinkTo(drag.value.fromLink, row.Link)
  );
  return {
    "order__platform-badge": true,
    "order__platform-badge--rebindable": rebindable,
    "order__platform-badge--dragging": dragging,
    "order__platform-badge--drop-ok": dropOk,
    "order__platform-badge--drop-blocked": dropBlocked,
  };
}

function badgeTitle(row: OrderRow): string {
  if (!props.allowLinkRebind || !isRebindableOrderRow(row))
    return String(row.Type || "");
  return "拖到更老 Link 的场馆徽章以改绑（确认框会展示两单详情）";
}
</script>

<template>
  <div class="orders" :class="{ loading, 'orders--rebind-active': !!drag }">
    <template v-for="[link, rows] in orderEntries" :key="link">
      <fieldset
        v-if="orderListDisplayRows(rows).length"
        class="orderlink"
        :class="{
          'orderlink--paired': isArbGroup(rows),
          'orderlink--unbound': groupHasUnboundPlaceholder(rows),
        }"
        :data-link-id="link"
      >
        <legend :class="orderLegendModifier(rows)">
          <span
            v-if="groupHasUnboundPlaceholder(rows)"
            class="orderlink__tag orderlink__tag--hash"
            title="本组仍有占位 Link，绑单确认前短暂态"
          >未绑单</span>
          {{ orderLegendText(rows) }}
        </legend>
        <div
          v-for="row in orderListDisplayRows(rows)"
          :key="String(row.OrderID)"
          class="order"
        >
          <div
            v-if="isMakeupPendingOrderRow(row)"
            class="order__status-anchor"
          >
            <i
              class="order__makeup-close"
              title="取消补单"
              role="button"
              @click="onCancelMakeup(row)"
            />
            <label class="status" :class="row.Status" />
          </div>
          <label v-else class="status" :class="statusClass(row)" />
          <div class="platform flex" :class="platformClass(row)">
            <span
              :class="badgeClass(row)"
              :data-rebind-order-id="isRebindableOrderRow(row) ? String(row.OrderID) : undefined"
              :title="badgeTitle(row)"
              @pointerdown="onBadgePointerDown($event, row)"
              @pointermove="onBadgePointerMove"
              @pointerup="onBadgePointerUp"
              @pointercancel="onBadgePointerCancel"
            >
              <PlatformIcon :platform="row.Type ?? ''" />
            </span>
            <div class="player">
              {{ playerLabel(row) }}
            </div>
          </div>
          <div class="match" v-html="row.Match" />
          <div class="bet">
            <div class="betname">
              <span v-html="row.Bet" />
            </div>
            <div class="item">
              <label v-html="row.Item" />
            </div>
          </div>
          <div class="profit">
            <template v-if="isPmOrderListRow(row)">
              <div class="order__profit-line">
                <span v-if="pmOrderSharesText(row)">份额：{{ pmOrderSharesText(row) }} </span>
                <span v-if="pmOrderFillPriceText(row)">买入价：{{ pmOrderFillPriceText(row) }} </span>
                <span v-if="pmOrderFillPriceText(row)">赔率：<span class="order__odds">{{ pmOrderOddsText(row) }}</span> </span>
                <span v-if="isPmSellOrderListRow(row)" class="order__pm-tag">卖出</span>
                <span v-else-if="pmBuyLifecycleTagText(row)" class="order__pm-tag">{{ pmBuyLifecycleTagText(row) }}</span>
              </div>
              <div class="order__profit-line">
                {{ pmStakeLabel(row) }}：{{ toFixed(Number(row.BetMoney) || 0, 0) }}
                <template v-if="isPendingRow(row) && !pmBuyLifecycleTagText(row) && !isPmSellOrderListRow(row)">
                  盈亏：待结算
                </template>
                <template v-else>
                  盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
                </template>
              </div>
              <div class="order__profit-line order__profit-line--sell-row">
                <span class="order__sell-row-meta">
                  <span v-if="pmShowLivePrice(row)">当前价：{{ pmLivePriceText(row) }} </span>
                  <span v-if="pmShowLivePrice(row)">当前赔率：<span class="order__odds">{{ pmLastLineOddsText(row) }}</span> </span>
                </span>
                <button
                  v-if="showPmSellButton(row)"
                  type="button"
                  class="order__sell-btn"
                  :disabled="isPmManualSellInFlight(row.OrderID)"
                  @click="onPmSell(row)"
                >
                  {{ isPmManualSellInFlight(row.OrderID) ? "卖出中…" : "卖出" }}
                </button>
              </div>
            </template>
            <template v-else>
              投注金额：{{ toFixed(Number(row.BetMoney) || 0, 0) }} 赔率：<span class="order__odds">{{
                formatDisplayOdds(Number(row.Odds) || 0)
              }}</span>
              <template v-if="isMakeupPendingOrderRow(row)">
                盈亏：{{ makeupPendingProfitLabel(row) }}
              </template>
              <template v-else-if="isMakeupCancelledOrderRow(row)">
                盈亏：补单已手动取消
              </template>
              <template v-else-if="isPendingRow(row)">
                盈亏：待结算
              </template>
              <template v-else>
                盈亏：{{ toFixed(Number(row.Money) || 0, 0) }}
              </template>
            </template>
          </div>
          <div class="time">
            投注时间：{{ formatOrderTime(row.CreateAt || 0) }}
          </div>
          <div v-if="$slots['row-actions']" class="order-list__row-actions">
            <slot name="row-actions" :row="row" :link="link" :rows="rows" />
          </div>
        </div>
        <div v-if="$slots['group-actions']" class="order-list__group-actions">
          <slot name="group-actions" :link="link" :rows="rows" />
        </div>
      </fieldset>
    </template>
  </div>
</template>
