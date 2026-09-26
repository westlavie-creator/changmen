import { describe, expect, it } from "vitest";
import { buildLogSegments, filterBackendLegSections } from "@/shared/adminOrderLogSegments";

describe("adminOrderLogSegments", () => {
  it("does not let makeup queue swallow the preceding failed leg", () => {
    const segments = buildLogSegments([
      {
        id: 1,
        createAt: 100,
        title: "PM check",
        kind: "check",
        provider: "Polymarket",
        target: "Away",
        summary: "PM check",
      },
      {
        id: 2,
        createAt: 110,
        title: "PM bet failed",
        kind: "bet",
        provider: "Polymarket",
        success: false,
        summary: "PM bet failed",
      },
      {
        id: 3,
        createAt: 120,
        title: "补单入队",
        kind: "makeup_queue",
        target: "Away",
        summary: "补单入队",
      },
      {
        id: 4,
        createAt: 200,
        title: "RAY makeup check",
        kind: "check",
        provider: "RAY",
        target: "Away",
        loseOrder: true,
        summary: "RAY makeup check",
      },
    ]);

    expect(segments.map(segment => segment.logs.map(log => log.kind))).toEqual([
      ["check", "bet"],
      ["makeup_queue"],
      ["check"],
    ]);
    expect(segments[0]?.provider).toBe("Polymarket");
    expect(segments[1]?.provider).toBeNull();
    expect(segments[2]?.isMakeUp).toBe(true);
  });

  it("preserves backend leg assignment for bet logs without target", () => {
    const pmCheck = { id: 1, createAt: 100, title: "PM check", kind: "check", provider: "Polymarket", target: "Away", summary: "PM check" } as any;
    const pmBet = { id: 2, createAt: 110, title: "PM failed", kind: "bet", provider: "Polymarket", target: null, success: false, summary: "PM failed" } as any;
    const rayCheck = { id: 3, createAt: 90, title: "RAY check", kind: "check", provider: "RAY", target: "Home", summary: "RAY check" } as any;
    const unrelated = { id: 4, createAt: 95, title: "other", kind: "check", provider: "RAY", target: "Home", summary: "other" } as any;
    const legs = [
      {
        key: "home",
        legIndex: 0,
        side: "Home",
        label: "主队",
        provider: "RAY",
        attempts: [{ key: "ray", order: null, logs: [rayCheck, unrelated], logSegments: [{ key: "ray-seg", provider: "RAY", accountLabel: null, isMakeUp: false, logs: [rayCheck, unrelated] }] }],
      },
      {
        key: "away",
        legIndex: 1,
        side: "Away",
        label: "客队",
        provider: "Polymarket",
        attempts: [{ key: "pm", order: null, logs: [pmCheck, pmBet], logSegments: [{ key: "pm-seg", provider: "Polymarket", accountLabel: null, isMakeUp: false, logs: [pmCheck, pmBet] }] }],
      },
    ] as any;

    const filtered = filterBackendLegSections(legs, [rayCheck, pmCheck, pmBet]);
    expect(filtered?.[0]?.attempts[0]?.logSegments?.[0]?.logs.map(log => log.id)).toEqual([3]);
    expect(filtered?.[1]?.attempts[0]?.logSegments?.[0]?.logs.map(log => log.id)).toEqual([1, 2]);
  });
});
