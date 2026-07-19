/**
 * PredictFun orderbook 行情总线（数据源层）。
 * - 只负责：连接、合并多消费者订阅、广播 quote
 * - 不知道电竞/体育；不写 fo
 */

import { bestAskFromPredictBook } from "./parse";
import {
  cyclePfMarketWsSourceMode,
  type PfMarketWsSourceMode,
} from "./pfMarketWsMode";
import { startPredictMarketWs, type PredictMarketWsHandle } from "./ws";

export interface PredictFunMarketQuote {
  marketId: string;
  bestAsk: number;
}

export type PredictFunQuoteConsumerId = "esport" | "sport" | (string & {});

type QuoteListener = (quote: PredictFunMarketQuote) => void;
type ReadyListener = () => void;

const consumers = new Map<string, Set<string>>();
const quoteListeners = new Set<QuoteListener>();
const readyListeners = new Set<ReadyListener>();

let wsHandle: PredictMarketWsHandle | null = null;
let readyEpoch = 0;

function sameIdSet(prev: Set<string>, next: string[]): boolean {
  const cleaned = [...new Set(next.map(id => String(id || "").trim()).filter(Boolean))];
  if (cleaned.length !== prev.size)
    return false;
  for (const id of cleaned) {
    if (!prev.has(id))
      return false;
  }
  return true;
}

function mergedMarketIds(): string[] {
  const all = new Set<string>();
  for (const set of consumers.values()) {
    for (const id of set)
      all.add(id);
  }
  return [...all];
}

function resubscribe(): void {
  if (!wsHandle)
    return;
  wsHandle.subscribeMarketIds(mergedMarketIds());
}

function emitQuote(marketId: string, bestAsk: number): void {
  if (!quoteListeners.size)
    return;
  if (!Number.isFinite(bestAsk) || bestAsk <= 0 || bestAsk >= 1)
    return;
  const quote = { marketId, bestAsk };
  for (const fn of quoteListeners) {
    try {
      fn(quote);
    }
    catch (err) {
      console.warn("[PredictFun] market quote listener", err);
    }
  }
}

function notifyReady(): void {
  for (const fn of readyListeners) {
    try {
      fn();
    }
    catch (err) {
      console.warn("[PredictFun] market hub ready listener", err);
    }
  }
}

function maybeStopTransport(): void {
  if (consumers.size > 0)
    return;
  if (!wsHandle)
    return;
  wsHandle.stop();
  wsHandle = null;
  readyEpoch += 1;
}

export function ensurePredictFunMarketQuoteHub(): void {
  if (wsHandle)
    return;
  wsHandle = startPredictMarketWs({
    onOrderbook: (update) => {
      const marketId = String(update.marketId ?? "");
      const ask = bestAskFromPredictBook(update.orderbook);
      if (!marketId || !(ask > 0))
        return;
      emitQuote(marketId, ask);
    },
  });
  readyEpoch += 1;
  const epoch = readyEpoch;
  queueMicrotask(() => {
    if (epoch !== readyEpoch)
      return;
    notifyReady();
  });
}

export function registerPredictFunQuoteMarkets(
  consumerId: PredictFunQuoteConsumerId,
  marketIds: string[],
  force = false,
): void {
  const key = String(consumerId || "").trim() || "anon";
  const next = new Set<string>();
  for (const id of marketIds) {
    const s = String(id || "").trim();
    if (s)
      next.add(s);
  }
  if (next.size === 0) {
    if (!consumers.has(key))
      return;
    consumers.delete(key);
    if (consumers.size > 0)
      resubscribe();
    else
      maybeStopTransport();
    return;
  }
  ensurePredictFunMarketQuoteHub();
  const prev = consumers.get(key) ?? new Set<string>();
  if (!force && sameIdSet(prev, marketIds))
    return;
  consumers.set(key, next);
  resubscribe();
}

export function unregisterPredictFunQuoteConsumer(consumerId: PredictFunQuoteConsumerId): void {
  const key = String(consumerId || "").trim() || "anon";
  if (!consumers.has(key))
    return;
  consumers.delete(key);
  if (consumers.size > 0)
    resubscribe();
  else
    maybeStopTransport();
}

/** 角标切换 official/changmen 后重建 WS，保留已有订阅 */
export function cyclePredictFunMarketWsSourceModeAndReconnect(): PfMarketWsSourceMode {
  const next = cyclePfMarketWsSourceMode();
  if (!wsHandle)
    return next;
  wsHandle.stop();
  wsHandle = null;
  readyEpoch += 1;
  ensurePredictFunMarketQuoteHub();
  resubscribe();
  return next;
}

export function onPredictFunMarketQuote(fn: QuoteListener): () => void {
  quoteListeners.add(fn);
  return () => {
    quoteListeners.delete(fn);
  };
}

export function onPredictFunMarketHubReady(fn: ReadyListener): () => void {
  readyListeners.add(fn);
  return () => {
    readyListeners.delete(fn);
  };
}

export function getPredictFunQuoteConsumerMarketIds(consumerId: PredictFunQuoteConsumerId): string[] {
  const set = consumers.get(String(consumerId || "").trim() || "anon");
  return set ? [...set] : [];
}

/** O(1) 查询；体育热路径过滤用 */
export function hasPredictFunQuoteConsumerMarket(
  consumerId: PredictFunQuoteConsumerId,
  marketId: string,
): boolean {
  const id = String(marketId || "").trim();
  if (!id)
    return false;
  return consumers.get(String(consumerId || "").trim() || "anon")?.has(id) ?? false;
}

/** @internal vitest */
export function __testPushPredictFunMarketQuote(marketId: string, bestAsk: number): void {
  emitQuote(marketId, bestAsk);
}

/** @internal vitest */
export function __testResetPredictFunMarketQuoteHub(): void {
  consumers.clear();
  quoteListeners.clear();
  readyListeners.clear();
  maybeStopTransport();
}
