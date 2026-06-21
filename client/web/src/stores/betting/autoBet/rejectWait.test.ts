import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { a8Tip } from "@/shared/a8Notify";

import { wait } from "@/shared/wait";
import { createDefaultUserConfig } from "@/types/userConfig";
import { rejectWaitSeconds, waitRejectDetection } from "./rejectWait";

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

describe("rejectWaitSeconds", () => {
  it("uses waitTime ?? 5 per success leg", () => {
    expect(rejectWaitSeconds(cfg({ OB: 0 }), [account("OB")])).toBe(0);
    expect(rejectWaitSeconds(cfg({ OB: -1 }), [account("OB")])).toBe(-1);
  });
});
