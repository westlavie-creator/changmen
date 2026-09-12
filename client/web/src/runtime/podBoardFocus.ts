/**
 * 跟单票 → 足球板那场/那格。只跳转高亮，不下单。
 */
import { ref } from "vue";
import { sportMatchStableKey } from "@/runtime/sportListPatch";
import type { PodBoardFixture } from "@/runtime/podFixtureMatch";
import type { PodMarketMatch, PodMarketSide } from "@/runtime/podMarketMatch";

export type PodBoardFocusTarget = {
  token: number;
  matchId: number;
  obMid: string;
  marketCode: string;
  side: PodMarketSide | null;
  line: number | null;
  oid: string;
};

export const podBoardFocus = ref<PodBoardFocusTarget | null>(null);

export function podBoardFocusMatchKey(row: {
  matchId?: number;
  id?: number;
  obMid?: string;
  providers?: Record<string, string | number>;
}): string {
  const ob = String(row.obMid || row.providers?.OB || "").trim();
  return sportMatchStableKey({
    id: Number(row.matchId ?? row.id) || 0,
    providers: ob ? { OB: ob } : row.providers,
  });
}

export function podBoardLineAttr(line: number | null | undefined): string {
  if (line == null)
    return "";
  const n = Number(line);
  return Number.isFinite(n) ? String(n) : "";
}

export function buildPodBoardFocus(
  fixture: Pick<PodBoardFixture, "id" | "obMid">,
  market?: Pick<PodMarketMatch, "status" | "marketCode" | "side" | "line" | "boardLine" | "boardSide" | "oid"> | null,
): Omit<PodBoardFocusTarget, "token"> {
  const hit = market?.status === "matched";
  return {
    matchId: Number(fixture.id) || 0,
    obMid: String(fixture.obMid || "").trim(),
    marketCode: hit ? String(market?.marketCode || "") : "",
    side: hit ? (market?.boardSide ?? market?.side ?? null) : null,
    line: hit ? (market?.boardLine ?? market?.line ?? null) : null,
    oid: hit ? String(market?.oid || "").trim() : "",
  };
}

export function requestPodBoardFocus(target: Omit<PodBoardFocusTarget, "token">) {
  podBoardFocus.value = {
    ...target,
    token: Date.now(),
  };
}

function cssAttr(value: string): string {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function podBoardMatchSelector(target: Pick<PodBoardFocusTarget, "matchId" | "obMid">): string {
  return `[data-pod-match=${cssAttr(podBoardFocusMatchKey(target))}]`;
}

export function podBoardOidSelector(oid: string): string {
  return `[data-odd-id=${cssAttr(oid)}]`;
}

export function podBoardBlockSelector(marketCode: string, line: number | null | undefined): string {
  return `[data-pod-market=${cssAttr(marketCode)}][data-pod-line=${cssAttr(podBoardLineAttr(line))}]`;
}

export function podBoardObSideSelector(side: string): string {
  return `[data-pod-venue="OB"][data-pod-side=${cssAttr(side)}]`;
}

export function selectPodBoardMatch(
  root: ParentNode | null | undefined,
  target: Pick<PodBoardFocusTarget, "matchId" | "obMid">,
): HTMLElement | null {
  if (!root)
    return null;
  const key = podBoardFocusMatchKey(target);
  if (!key)
    return null;
  return root.querySelector<HTMLElement>(podBoardMatchSelector(target));
}

export function selectPodBoardCell(
  matchEl: ParentNode | null | undefined,
  target: Pick<PodBoardFocusTarget, "marketCode" | "side" | "line" | "oid">,
): HTMLElement | null {
  if (!matchEl)
    return null;
  const oid = String(target.oid || "").trim();
  if (oid) {
    const byOid = matchEl.querySelector<HTMLElement>(podBoardOidSelector(oid));
    if (byOid)
      return byOid;
  }
  const code = String(target.marketCode || "").trim();
  const side = String(target.side || "").trim();
  if (!code || !side)
    return null;
  const block = matchEl.querySelector<HTMLElement>(podBoardBlockSelector(code, target.line));
  if (!block)
    return null;
  return block.querySelector<HTMLElement>(podBoardObSideSelector(side))
    || block.querySelector<HTMLElement>(`[data-pod-side=${cssAttr(side)}]`);
}
