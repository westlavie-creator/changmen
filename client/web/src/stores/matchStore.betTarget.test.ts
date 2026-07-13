import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publishBetTargetPayload = vi.hoisted(() =>
  vi.fn<(payload: Record<string, Record<string, string>>) => Promise<boolean>>(async () => true),
);

vi.mock("@/realtime/betTargetPublish", () => ({
  publishBetTargetPayload: (payload: Record<string, Record<string, string>>) =>
    publishBetTargetPayload(payload),
}));

const userState = vi.hoisted(() => ({
  setting: { BetTarget: true } as Record<string, unknown>,
}));

vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({
    betTargetEnabled: () => Boolean(userState.setting?.BetTarget),
  }),
}));

function mockSessionStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  });
}

import { useMatchStore } from "@/stores/matchStore";

describe("matchStore.saveBetTarget", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    publishBetTargetPayload.mockClear();
    mockSessionStorage();
    userState.setting = { BetTarget: true };
  });

  it("publishes full snapshot to BetTarget and persists sessionStorage", async () => {
    const store = useMatchStore();
    store.betTargets = new Map([
      ["PB", new Map([[42, "Home"]])],
    ]);

    const ok = await store.saveBetTarget();
    expect(ok).toBe(true);
    expect(publishBetTargetPayload).toHaveBeenCalledOnce();
    const payload = publishBetTargetPayload.mock.calls[0]?.[0];
    expect(payload).toEqual({ PB: { 42: "Home" } });
    expect(JSON.parse(sessionStorage.getItem("BetTarget")!)).toEqual({ PB: { 42: "Home" } });
  });

  it("skips publish when BetTarget setting is off", async () => {
    userState.setting = {};
    const store = useMatchStore();
    store.betTargets = new Map([["PB", new Map([[1, "Away"]])]]);

    const ok = await store.saveBetTarget();
    expect(ok).toBe(false);
    expect(publishBetTargetPayload).not.toHaveBeenCalled();
  });
});
