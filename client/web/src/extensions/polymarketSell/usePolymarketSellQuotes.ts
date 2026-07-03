import type { OrderRow } from "@/types/order";
import type { Ref } from "vue";
import { onScopeDispose, ref, watch } from "vue";
import { fetchPmSellQuotes, pmStakeUsdcFromRow, type PmSellQuoteView } from "./pmSellQuotes";

const POLL_MS = 4_000;

function openPolymarketPositions(rows: OrderRow[]) {
  const seen = new Set<string>();
  const entries: Array<{ tokenId: string; shares: number; stakeUsdc: number }> = [];
  for (const row of rows) {
    if (String(row.Type ?? "") !== "Polymarket")
      continue;
    if (String(row.Status ?? "") !== "None")
      continue;
    const tokenId = String(row.PmTokenId ?? "").trim();
    const shares = Number(row.PmShares) || 0;
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

export function usePolymarketSellQuotes(orderRows: Ref<readonly OrderRow[]>) {
  const quotes = ref<Map<string, PmSellQuoteView>>(new Map());
  const loading = ref(false);
  let timer: ReturnType<typeof setInterval> | null = null;
  let tick = 0;

  async function refresh() {
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
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  watch(orderRows, () => void refresh(), { deep: true });
  start();
  onScopeDispose(stop);

  function quoteForRow(row: OrderRow): PmSellQuoteView | undefined {
    const tokenId = String(row.PmTokenId ?? "").trim();
    return tokenId ? quotes.value.get(tokenId) : undefined;
  }

  return { quotes, loading, refresh, quoteForRow };
}
