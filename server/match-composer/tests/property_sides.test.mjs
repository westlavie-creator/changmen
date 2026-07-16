/**
 * 属性：sticky/upgrade × 多馆朝向 → OB.Home + RAY.Away 不得同 gb。
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { projectClientMatchSides } from "../src/sides/project_sources.js";
import { checkNotSamePhysicalSide } from "../src/invariants.js";
import {
  installPlugin,
  makeBets,
  pmOb,
  pmRay,
  pmRayFlipped,
  rawOb,
  rawRay,
  rawRayFlipped,
} from "./fixtures.mjs";

const cases = [
  { sticky: true, rayFlipped: false, override: undefined },
  { sticky: true, rayFlipped: false, override: "force_aligned" },
  { sticky: false, rayFlipped: false, override: "force_aligned" },
  { sticky: true, rayFlipped: true, override: undefined },
  { sticky: false, rayFlipped: true, override: "force_aligned" },
  { sticky: true, rayFlipped: true, override: "force_reversed" },
];

describe("property: hedge slots never same gb", () => {
  for (const c of cases) {
    it(`sticky=${c.sticky} rayFlipped=${c.rayFlipped} ov=${c.override || "-"}`, () => {
      installPlugin();
      const rayPm = c.rayFlipped ? pmRayFlipped : pmRay;
      const rayRaw = c.rayFlipped ? rawRayFlipped : rawRay;
      const matches = { OB: { ob1: pmOb }, RAY: { ray1: rayPm } };
      const row = {
        ID: 77,
        Matchs: { OB: "ob1", RAY: "ray1" },
        Bets: [{ Map: 0, Sources: {} }],
      };
      projectClientMatchSides(row, {
        matches,
        bets: makeBets({ OB: { 0: rawOb }, RAY: { 0: rayRaw } }),
        platformOverrides: c.override ? { 77: { RAY: c.override } } : {},
        stickyOrientation: c.sticky,
      });
      assert.ok(row.Bets[0].Sources.OB, "OB Sources required for property case");
      assert.ok(row.Bets[0].Sources.RAY, "RAY Sources required for property case");
      const r = checkNotSamePhysicalSide(row, {
        platformA: "OB",
        slotA: "Home",
        platformB: "RAY",
        slotB: "Away",
        nativeByPlatformMap: { "OB:0": rawOb, "RAY:0": rayRaw },
        matches,
      });
      assert.equal(r.skipped, undefined);
      assert.equal(r.ok, true, r.violations?.join("; "));
    });
  }
});
