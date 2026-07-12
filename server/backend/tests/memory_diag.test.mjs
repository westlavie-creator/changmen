import { describe, expect, it } from "vitest";
import { getProcessMemorySnapshot } from "../core/shared/memory_diag.js";

describe("getProcessMemorySnapshot", () => {
  it("returns rss and heap fields in MB", () => {
    const snap = getProcessMemorySnapshot();
    expect(snap.rssMb).toBeGreaterThan(0);
    expect(snap.heapUsedMb).toBeGreaterThan(0);
    expect(snap.nonHeapMb).toBeGreaterThanOrEqual(0);
    expect(snap.rssMb).toBeGreaterThanOrEqual(snap.heapUsedMb);
  });
});
