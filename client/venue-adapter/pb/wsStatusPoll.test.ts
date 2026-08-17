import { beforeEach, describe, expect, test } from "vitest";
import { selectionId } from "./parse";
import {
  getPbWsShadow,
  resetPbWsShadowForTests,
  savePbWsShadow,
} from "./wsShadowOdds";
import {
  ingestShadow,
  mapObserveToStatus,
  setPbWsShadowUiAllowed,
} from "./wsStatusPoll";

describe("mapObserveToStatus", () => {
  test("connected when observe reports connected", () => {
    expect(mapObserveToStatus({ enabled: true, observe: { connected: true } })).toBe(
      "connected",
    );
  });

  test("connecting while observe enabled but not yet connected", () => {
    expect(
      mapObserveToStatus({ enabled: true, observe: { running: true, phase: "hook_start" } }),
    ).toBe("connecting");
  });

  test("readyState OPEN counts as connected (socket already up)", () => {
    expect(
      mapObserveToStatus({
        enabled: true,
        observe: {
          connected: false,
          readyState: 1,
          phase: "hooked",
          frameCount: 0,
        },
      }),
    ).toBe("connected");
  });

  test("error when lastError set and not connected", () => {
    expect(
      mapObserveToStatus({ enabled: true, observe: { lastError: "boom", connected: false } }),
    ).toBe("error");
  });

  test("disconnected when empty", () => {
    expect(mapObserveToStatus(null)).toBe("disconnected");
    expect(mapObserveToStatus({ enabled: false, observe: {} })).toBe("disconnected");
  });
});

describe("ingestShadow prefs gate", () => {
  beforeEach(() => {
    resetPbWsShadowForTests();
    setPbWsShadowUiAllowed(false);
  });

  test("prefs off clears even if observe has board", () => {
    savePbWsShadow(selectionId(1, 0, "HOME"), { odds: 1.5, isLock: false });
    setPbWsShadowUiAllowed(false);
    ingestShadow({
      enabled: true,
      observe: {
        connected: true,
        latestOdds: [{ eventId: 1, period: 0, betType: 1, home: "1.9", away: "2.0" }],
      },
    });
    expect(getPbWsShadow(selectionId(1, 0, "HOME"))).toBeUndefined();
  });

  test("prefs on + observe on ingests board", () => {
    setPbWsShadowUiAllowed(true);
    ingestShadow({
      enabled: true,
      observe: {
        connected: true,
        latestOdds: [{ eventId: 9, period: 1, betType: 1, home: "1.11", away: "3.33" }],
      },
    });
    expect(getPbWsShadow(selectionId(9, 1, "HOME"))?.odds).toBe(1.11);
  });

  test("turning prefs off clears residual board", () => {
    setPbWsShadowUiAllowed(true);
    ingestShadow({
      enabled: true,
      observe: {
        connected: true,
        latestOdds: [{ eventId: 3, period: 0, betType: 1, home: "1.2", away: "2.2" }],
      },
    });
    expect(getPbWsShadow(selectionId(3, 0, "HOME"))?.odds).toBe(1.2);
    setPbWsShadowUiAllowed(false);
    expect(getPbWsShadow(selectionId(3, 0, "HOME"))).toBeUndefined();
    // false→false 也必须保持空表
    setPbWsShadowUiAllowed(false);
    expect(getPbWsShadow(selectionId(3, 0, "HOME"))).toBeUndefined();
  });
});
