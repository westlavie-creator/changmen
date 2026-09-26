import { describe, expect, it } from "vitest";
import {
  pickPodObAccountsForPlacement,
  POD_OB_ACCOUNT_ROTATION_KEY,
} from "@/runtime/podObAccountRotation";

function memoryStorage() {
  const rows = new Map<string, string>();
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => void rows.set(key, value),
  };
}

describe("POD OB account rotation", () => {
  const accounts = [
    { accountId: 11, playerName: "A" },
    { accountId: 22, playerName: "B" },
    { accountId: 33, playerName: "C" },
  ];

  it("keeps the existing fan-out behavior when rotation is off", () => {
    expect(pickPodObAccountsForPlacement(accounts, false, memoryStorage())).toEqual(accounts);
  });

  it("uses one account per attempt and wraps in account order", () => {
    const storage = memoryStorage();
    expect(pickPodObAccountsForPlacement(accounts, true, storage)[0]?.accountId).toBe(11);
    expect(pickPodObAccountsForPlacement(accounts, true, storage)[0]?.accountId).toBe(22);
    expect(pickPodObAccountsForPlacement(accounts, true, storage)[0]?.accountId).toBe(33);
    expect(pickPodObAccountsForPlacement(accounts, true, storage)[0]?.accountId).toBe(11);
    expect(storage.getItem(POD_OB_ACCOUNT_ROTATION_KEY)).toBe("11");
  });

  it("starts from the first selected account if the previous account was removed", () => {
    const storage = memoryStorage();
    storage.setItem(POD_OB_ACCOUNT_ROTATION_KEY, "11");
    expect(pickPodObAccountsForPlacement(accounts.slice(1), true, storage)[0]?.accountId).toBe(22);
  });

  it("leaves a single selected account unchanged", () => {
    const storage = memoryStorage();
    expect(pickPodObAccountsForPlacement(accounts.slice(0, 1), true, storage)).toEqual(accounts.slice(0, 1));
    expect(storage.getItem(POD_OB_ACCOUNT_ROTATION_KEY)).toBeNull();
  });
});
