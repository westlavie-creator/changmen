import { describe, expect, it, vi } from "vitest";
import { PlatformAccount } from "@/models/platformAccount";
import { mergeVaultKeysIntoAccounts } from "./accounts";

const mockData = vi.hoisted(() => ({
  privateKey: `0x${"ab".repeat(32)}`,
  walletAddress: "0x1111111111111111111111111111111111111111",
}));

vi.mock("./session", () => ({
  isPmVaultUnlocked: vi.fn(() => true),
  getCachedPrivateKey: vi.fn((_accountId: number, wallet?: string) =>
    String(wallet || "").toLowerCase() === mockData.walletAddress ? mockData.privateKey : undefined,
  ),
  putPrivateKeyInVault: vi.fn(),
}));

describe("pmVault accounts", () => {
  it("merges vault private key by wallet address when account id changed", () => {
    const acc = new PlatformAccount({
      accountId: 99,
      provider: "Polymarket",
      token: JSON.stringify({ walletAddress: mockData.walletAddress, apiCreds: { apiKey: "k", secret: "s", passphrase: "p" } }),
    });

    const result = mergeVaultKeysIntoAccounts([acc], "7");

    expect(result.merged).toBe(1);
    expect(JSON.parse(acc.token || "{}").privateKey).toBe(mockData.privateKey);
  });
});
