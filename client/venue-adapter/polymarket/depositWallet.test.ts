import { decodeFunctionData } from "viem";
import { describe, expect, test } from "vitest";
import { POLYGON_POLYMARKET, polymarketTradeSpenders } from "./contracts";
import { buildDepositWalletApprovalCalls } from "./depositWallet";
import { buildStandardApprovalTransactions } from "./relayer";

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const ERC1155_SET_APPROVAL_FOR_ALL_ABI = [
  {
    name: "setApprovalForAll",
    type: "function",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

describe("buildDepositWalletApprovalCalls", () => {
  test("includes collateral approve and CTF setApprovalForAll for each trade spender", () => {
    const calls = buildDepositWalletApprovalCalls();
    const spenders = new Set(polymarketTradeSpenders().map(a => a.toLowerCase()));

    const usdcApproves = new Set<string>();
    const pusdApproves = new Set<string>();
    const ctfApprovals = new Set<string>();

    for (const call of calls) {
      const target = call.target.toLowerCase();
      if (target === POLYGON_POLYMARKET.USDC.toLowerCase()) {
        const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: call.data as `0x${string}` });
        expect(decoded.functionName).toBe("approve");
        usdcApproves.add(String(decoded.args[0]).toLowerCase());
      }
      else if (target === POLYGON_POLYMARKET.PUSD.toLowerCase()) {
        const decoded = decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: call.data as `0x${string}` });
        expect(decoded.functionName).toBe("approve");
        pusdApproves.add(String(decoded.args[0]).toLowerCase());
      }
      else if (target === POLYGON_POLYMARKET.CTF.toLowerCase()) {
        const decoded = decodeFunctionData({
          abi: ERC1155_SET_APPROVAL_FOR_ALL_ABI,
          data: call.data as `0x${string}`,
        });
        expect(decoded.functionName).toBe("setApprovalForAll");
        expect(decoded.args[1]).toBe(true);
        ctfApprovals.add(String(decoded.args[0]).toLowerCase());
      }
      else {
        throw new Error(`unexpected call target ${call.target}`);
      }
    }

    expect(usdcApproves.has(POLYGON_POLYMARKET.CTF.toLowerCase())).toBe(true);
    expect(pusdApproves.has(POLYGON_POLYMARKET.CTF.toLowerCase())).toBe(true);
    for (const spender of spenders) {
      expect(usdcApproves.has(spender)).toBe(true);
      expect(pusdApproves.has(spender)).toBe(true);
      expect(ctfApprovals.has(spender)).toBe(true);
    }
  });

  test("matches legacy Safe/Proxy approval calldata targets", () => {
    const legacy = buildStandardApprovalTransactions();
    const deposit = buildDepositWalletApprovalCalls();
    expect(deposit.length).toBe(legacy.length);
    for (let i = 0; i < legacy.length; i += 1) {
      expect(deposit[i]!.target.toLowerCase()).toBe(legacy[i]!.to.toLowerCase());
      expect(deposit[i]!.data).toBe(legacy[i]!.data);
    }
  });
});
