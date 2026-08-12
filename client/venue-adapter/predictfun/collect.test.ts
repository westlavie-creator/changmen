import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));

describe("PredictFun collect fo lock contracts", () => {
  test("WS quote path writes locked:false (do not zero getOdds when other side missing)", () => {
    const src = readFileSync(join(root, "collect.ts"), "utf8");
    const start = src.indexOf("function updateBetFromToken");
    const end = src.indexOf("const unQuote", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toMatch(/locked:\s*false/);
    expect(body).not.toMatch(/locked:\s*.*Status/);
  });

  test("Index http seed unlocks priced side (ignore market Status Locked)", () => {
    const src = readFileSync(join(root, "collect.ts"), "utf8");
    const start = src.indexOf("function saveBetOddsToFo");
    const end = src.indexOf("function bookMetasFromIndexEntries");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toMatch(/prev\?\.source === "mqtt"/);
    expect(body).toMatch(/locked:\s*false/);
    // 禁止再用市场级 Status Locked 把有价一侧打成 isLock（PM 已修，PF 对齐）
    expect(body).not.toMatch(/Status === "Locked"/);
    expect(body).not.toMatch(/locked:\s*locked\s*\|\|/);
    expect(body).not.toMatch(/isLock:\s*locked\s*\|\|/);
  });
});
