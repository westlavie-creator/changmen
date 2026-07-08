import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { a8Tip } from "@/shared/a8Notify";

import { wait } from "@/shared/wait";
import { createDefaultUserConfig } from "@/types/userConfig";
import { rejectWaitSeconds, waitRejectDetection, legRejectWaitSec, maxLegRejectWaitSec, showRejectDetectionTip } from "./rejectWait";

vi.mock("@/shared/a8Notify", () => ({
  a8Tip: vi.fn(),
}));

vi.mock("@/shared/wait", () => ({
  wait: vi.fn(() => Promise.resolve()),
}));

function cfg(waitTime: Record<string, number>): UserConfig {
  return { ...createDefaultUserConfig(), waitTime };
}

function account(provider: string): PlatformAccount {
  return { provider } as PlatformAccount;
}

describe("waitRejectDetection", () => {
  beforeEach(() => {
    vi.mocked(a8Tip).mockClear();
    vi.mocked(wait).mockClear();
  });

  it("shows tip with Oe even when q is 0 (A8 auto arb)", async () => {
    await waitRejectDetection(10, 0);

    expect(a8Tip).toHaveBeenCalledWith(
      "拒单检测",
      "等待<countdown>10</countdown>秒",
      10_000,
    );
    expect(wait).not.toHaveBeenCalled();
  });

  it("shows tip with Oe and waits q seconds when q>0", async () => {
    await waitRejectDetection(10, 3);

    expect(a8Tip).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it("skips tip when countdown is 0", async () => {
    await waitRejectDetection(0, 0);

    expect(a8Tip).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });
});

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
});

describe("showRejectDetectionTip", () => {
  beforeEach(() => {
    vi.mocked(a8Tip).mockClear();
  });

  it("shows tip without blocking wait helper", async () => {
    await showRejectDetectionTip(8);
    expect(a8Tip).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});

describe("rejectWaitSeconds", () => {
  it("uses waitTime ?? 5 per success leg", () => {
    expect(rejectWaitSeconds(cfg({ OB: 0 }), [account("OB")])).toBe(0);
    expect(rejectWaitSeconds(cfg({ OB: -1 }), [account("OB")])).toBe(-1);
  });
});
