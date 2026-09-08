import { defineStore } from "pinia";
import {
  mergeObSportLivePatch,
  type ObSportLiveMatch,
  type ObSportLivePatch,
} from "@/runtime/obSportLive";

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
  }),
  actions: {
    applyLive(patch: ObSportLivePatch) {
      const mid = String(patch.mid || "").trim();
      if (!mid)
        return;
      this.byMid[mid] = mergeObSportLivePatch(this.byMid[mid], patch);
      this.tick += 1;
    },
    saveLine(oid: string, line: number | null | undefined) {
      const id = String(oid || "").trim();
      if (!id || line == null || !Number.isFinite(Number(line)))
        return;
      const n = Number(line);
      if (this.lineByOid[id] === n)
        return;
      this.lineByOid[id] = n;
      this.tick += 1;
    },
    noteHandicapPlay(mid: string) {
      const id = String(mid || "").trim();
      if (!id)
        return;
      this.playRevByMid[id] = (this.playRevByMid[id] || 0) + 1;
      this.tick += 1;
    },
    noteListChange() {
      this.listRev += 1;
      this.tick += 1;
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
      this.tick += 1;
    },
  },
});
