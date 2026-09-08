import { defineStore } from "pinia";
import { createRafTicker } from "@/runtime/rafTick";
import {
  mergeObSportLivePatch,
  type ObSportLiveMatch,
  type ObSportLivePatch,
} from "@/runtime/obSportLive";

const scheduleLiveTick = createRafTicker();
const scheduleLineTick = createRafTicker();

function liveIdentity(row: ObSportLiveMatch | undefined) {
  if (!row)
    return "";
  return `${row.home ?? ""}|${row.away ?? ""}|${row.mmp}|${row.ms}`;
}

/**
 * OB 体育滚球态。禁止写入电竞 matchStore / liveTimer。
 */
export const useObSportLiveStore = defineStore("obSportLive", {
  state: () => ({
    byMid: {} as Record<string, ObSportLiveMatch>,
    lineByOid: {} as Record<string, number>,
    playRevByMid: {} as Record<string, number>,
    listRev: 0,
    tick: 0,
    lineTick: 0,
  }),
  actions: {
    applyLive(patch: ObSportLivePatch) {
      const mid = String(patch.mid || "").trim();
      if (!mid)
        return;
      const prev = this.byMid[mid];
      const next = mergeObSportLivePatch(prev, patch);
      const scoreChanged = liveIdentity(prev) !== liveIdentity(next);
      if (prev) {
        prev.home = next.home;
        prev.away = next.away;
        prev.mmp = next.mmp;
        prev.elapsedSec = next.elapsedSec;
        prev.ms = next.ms;
        prev.updatedAt = next.updatedAt;
      }
      else {
        this.byMid[mid] = next;
        scheduleLiveTick(() => { this.tick += 1; });
        return;
      }
      if (scoreChanged)
        scheduleLiveTick(() => { this.tick += 1; });
    },
    saveLine(oid: string, line: number | null | undefined) {
      this.saveLines([{ oid, line }]);
    },
    saveLines(rows: Array<{ oid: string; line: number | null | undefined }>) {
      let changed = false;
      for (const row of rows) {
        const id = String(row.oid || "").trim();
        if (!id || row.line == null || !Number.isFinite(Number(row.line)))
          continue;
        const n = Number(row.line);
        if (this.lineByOid[id] === n)
          continue;
        this.lineByOid[id] = n;
        changed = true;
      }
      if (changed)
        scheduleLineTick(() => { this.lineTick += 1; });
    },
    noteHandicapPlay(mid: string) {
      const id = String(mid || "").trim();
      if (!id)
        return;
      this.playRevByMid[id] = (this.playRevByMid[id] || 0) + 1;
    },
    noteListChange() {
      this.listRev += 1;
    },
    get(mid: string): ObSportLiveMatch | undefined {
      return this.byMid[String(mid || "").trim()];
    },
    getLine(oid: string): number | null {
      const n = this.lineByOid[String(oid || "").trim()];
      return Number.isFinite(n) ? n : null;
    },
    clear() {
      this.byMid = {};
      this.lineByOid = {};
      this.playRevByMid = {};
      scheduleLiveTick(() => { this.tick += 1; });
      scheduleLineTick(() => { this.lineTick += 1; });
    },
  },
});
