import type { OrderRow } from "@/types/order";
import type { Ref } from "vue";
import { onScopeDispose, ref, watch } from "vue";
import { resolvePmRemainingShares } from "@venue/polymarket/pmLogicalPosition";
import { fetchPmSellQuotes, pmStakeUsdcFromRow, type PmSellQuoteView } from "./pmSellQuotes";

const POLL_MS = 4_000;

function openPolymarketPositions(rows: OrderRow[]) {
  const seen = new Set<string>();
  const entries: Array<{ tokenId: string; shares: number; stakeUsdc: number }> = [];
  for (const row of rows) {
    if (String(row.Type ?? "") !== "Polymarket")
      continue;
    if (row.PmSide === "sell")
      continue;
    if (String(row.Status ?? "") !== "None")
      continue;
    if (row.PmOrigin !== "changmen")
      continue;
    const tokenId = String(row.PmTokenId ?? "").trim();
    const shares = resolvePmRemainingShares(row);
    if (!tokenId || shares <= 0 || seen.has(tokenId))
      continue;
    seen.add(tokenId);
    entries.push({
      tokenId,
      shares,
      stakeUsdc: pmStakeUsdcFromRow(row.PmStakeUsdc, Number(row.BetMoney) || 0),
    });
  }
  return entries;
}

export function usePolymarketSellQuotes(
  orderRows: Ref<readonly OrderRow[]>,
  enabled: Ref<boolean>,
) {
  const quotes = ref<Map<string, PmSellQuoteView>>(new Map());
  const loading = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let tick = 0;

  async function refresh() {
    if (!enabled.value) {
      quotes.value = new Map();
      return;
    }
    const entries = openPolymarketPositions([...orderRows.value]);
    if (!entries.length) {
      quotes.value = new Map();
      return;
    }
    const run = ++tick;
    loading.value = true;
    try {
      const next = await fetchPmSellQuotes(entries);
      if (run === tick)
        quotes.value = next;
    }
    catch {
      // 插件/网络失败时保留上一轮报价
    }
    finally {
      if (run === tick)
        loading.value = false;
    }
  }

  function start() {
    stop();
    if (!enabled.value)
      return;
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  watch(enabled, () => {
    if (enabled.value)
      start();
    else {
      stop();
      quotes.value = new Map();
    }
  }, { immediate: true });

  watch(orderRows, () => {
    if (enabled.value)
      void refresh();
  }, { deep: true });

  onScopeDispose(stop);

  function quoteForRow(row: OrderRow): PmSellQuoteView | undefined {
    const tokenId = String(row.PmTokenId ?? "").trim();
    return tokenId ? quotes.value.get(tokenId) : undefined;
  }

  return { quotes, loading, refresh, quoteForRow };
}
