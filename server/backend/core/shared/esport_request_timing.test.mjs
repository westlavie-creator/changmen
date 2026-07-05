import { describe, expect, it } from "vitest";
import {
  getEsportRequestTimingSnapshot,
  recordEsportRequest,
  resetEsportRequestTimingForTest,
} from "./esport_request_timing.js";

describe("esport_request_timing", () => {
  it("records last delay and slow recent entries", () => {
    resetEsportRequestTimingForTest();
    recordEsportRequest("Client_GetMatchs", 120);
    recordEsportRequest("Client_GetOrders", 2100);

    const snap = getEsportRequestTimingSnapshot();
    expect(snap.counter).toBe(2);
    expect(snap.lastDelayMs).toBe(2100);
    expect(snap.lastAction).toBe("Client_GetOrders");
    expect(snap.slowRecent).toHaveLength(1);
    expect(snap.slowRecent[0].action).toBe("Client_GetOrders");
    expect(snap.byAction.find(a => a.action === "Client_GetOrders")?.maxMs).toBe(2100);
  });
});
