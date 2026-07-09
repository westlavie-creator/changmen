import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { a8Tip } from "@/shared/a8Notify";

import { legRejectWaitSec, maxLegRejectWaitSec, showRejectDetectionTip } from "./rejectWait";

vi.mock("@/shared/a8Notify", () => ({
  a8Tip: vi.fn(),
}));

function cfg(waitTime: Record<string, number>): UserConfig {
  return { waitTime } as UserConfig;
}

function account(provider: string): PlatformAccount {
  return { provider } as PlatformAccount;
}

describe("legRejectWaitSec", () => {
  it("returns 0 for Polymarket and -1", () => {
    expect(legRejectWaitSec(cfg({ Polymarket: 15 }), "Polymarket")).toBe(0);
    expect(legRejectWaitSec(cfg({ OB: -1 }), "OB")).toBe(0);
  });

  it("uses waitTime ?? 5 for A8 venues", () => {
    expect(legRejectWaitSec(cfg({ OB: 15 }), "OB")).toBe(15);
    expect(legRejectWaitSec(cfg({}), "OB")).toBe(5);
  });
});

describe("maxLegRejectWaitSec", () => {
  it("uses max per-leg venue wait", () => {
    expect(maxLegRejectWaitSec(cfg({ OB: 5, RAY: 15 }), [account("OB"), account("RAY")])).toBe(15);
    expect(maxLegRejectWaitSec(cfg({ OB: 5, Polymarket: 20 }), [account("OB"), account("Polymarket")])).toBe(5);
  });

  it("returns 0 when only Polymarket legs (no A8 reject wait)", () => {
    expect(maxLegRejectWaitSec(cfg({ Polymarket: 20 }), [account("Polymarket")])).toBe(0);
    expect(maxLegRejectWaitSec(cfg({}), [account("Polymarket"), account("Polymarket")])).toBe(0);
  });
});

describe("showRejectDetectionTip", () => {
  beforeEach(() => {
    vi.mocked(a8Tip).mockClear();
  });

  it("shows tip without blocking wait helper", async () => {
    await showRejectDetectionTip(8);
    expect(a8Tip).toHaveBeenCalledTimes(1);
  });

  it("skips tip when countdown is 0", async () => {
    await showRejectDetectionTip(0);
    expect(a8Tip).not.toHaveBeenCalled();
  });
});
