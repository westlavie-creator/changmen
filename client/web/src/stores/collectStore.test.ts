import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveMatchSource } from "@/api/esport";
import { useCollectStore } from "./collectStore";

vi.mock("@/api/esport", () => ({
  getClientData: vi.fn(async () => ({ collect: [["OB", true]], log: false })),
  saveClientData: vi.fn(),
  saveMatchSource: vi.fn(async () => true),
  saveBetSource: vi.fn(async () => true),
  saveUserLog: vi.fn(),
}));

describe("collectStore.saveMatch A8 parity", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.mocked(saveMatchSource).mockClear();
    const store = useCollectStore();
    await store.init();
  });

  it("posts empty match list when collect switch is on", async () => {
    const store = useCollectStore();
    const ok = await store.saveMatch("OB", []);
    expect(ok).toBe(true);
    expect(saveMatchSource).toHaveBeenCalledWith("OB", []);
  });

  it("skips API when collect switch is off", async () => {
    const store = useCollectStore();
    store.collect.set("OB", false);
    const ok = await store.saveMatch("OB", []);
    expect(ok).toBe(false);
    expect(saveMatchSource).not.toHaveBeenCalled();
  });
});
