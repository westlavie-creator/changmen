import { describe, expect, it } from "vitest";

import {
  applyPositionEventsOnSave,
  collectIncomingPositionSellEvents,
  normalizePositionSellEvent,
  readPositionSellEvents,
  upsertPositionSellEvents,
} from "./position_events.js";

describe("position_events", () => {
  it("normalizePositionSellEvent requires id", () => {
    expect(normalizePositionSellEvent({ shares: 1 })).toBeNull();
    expect(normalizePositionSellEvent({ id: "0xs1", shares: 1.5, proceeds: 2 })).toMatchObject({
      id: "0xs1",
      shares: 1.5,
      proceeds: 2,
    });
  });

  it("upsertPositionSellEvents is idempotent by id (case-insensitive)", () => {
    const once = upsertPositionSellEvents([], [{
      id: "0xSell",
      at: 10,
      shares: 1,
      proceeds: 2,
      origin: "changmen",
    }]);
    const twice = upsertPositionSellEvents(once, [{
      id: "0xsell",
      at: 10,
      shares: 1,
      proceeds: 2.5,
      origin: "changmen",
    }]);
    expect(twice).toHaveLength(1);
    expect(twice[0].proceeds).toBe(2.5);
    expect(twice[0].id).toBe("0xsell");
  });

  it("applyPositionEventsOnSave keeps prev when sync omits sells", () => {
    const prevRaw = {
      pmSide: "buy",
      positionEvents: {
        sells: [{ id: "0xs1", at: 1, shares: 3, proceeds: 4, origin: "changmen" }],
      },
    };
    const merged = { pmSide: "buy", pmShares: 10 };
    applyPositionEventsOnSave(merged, prevRaw, { provider: "Polymarket", pmSide: "buy" });
    expect(readPositionSellEvents(merged)).toHaveLength(1);
    expect(merged.positionEvents.sells[0].id).toBe("0xs1");
  });

  it("applyPositionEventsOnSave upserts new sell without dropping old", () => {
    const prevRaw = {
      positionEvents: {
        sells: [{ id: "0xs1", at: 1, shares: 3, proceeds: 4, origin: "changmen" }],
      },
    };
    const o = {
      pmSide: "buy",
      positionEvents: {
        sells: [{ id: "0xs2", at: 2, shares: 2, proceeds: 3, origin: "changmen" }],
      },
    };
    const merged = { ...o };
    applyPositionEventsOnSave(merged, prevRaw, o);
    expect(readPositionSellEvents(merged).map(s => s.id)).toEqual(["0xs1", "0xs2"]);
  });

  it("empty incoming sells array does not wipe prev", () => {
    const prevRaw = {
      positionEvents: {
        sells: [{ id: "0xs1", at: 1, shares: 1, proceeds: 1 }],
      },
    };
    const o = { positionEvents: { sells: [] } };
    const merged = { ...o };
    applyPositionEventsOnSave(merged, prevRaw, o);
    expect(readPositionSellEvents(merged)).toHaveLength(1);
  });

  it("strips positionEvents from sell rows", () => {
    const merged = {
      pmSide: "sell",
      positionEvents: { sells: [{ id: "x", shares: 1, proceeds: 1 }] },
    };
    applyPositionEventsOnSave(merged, {}, merged, { isSellRow: true });
    expect(merged.positionEvents).toBeUndefined();
  });

  it("collectIncomingPositionSellEvents reads top-level sells alias", () => {
    const list = collectIncomingPositionSellEvents({
      sells: [{ orderId: "0xa", shares: 1, proceeds: 2 }],
    }, {});
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("0xa");
  });
});
