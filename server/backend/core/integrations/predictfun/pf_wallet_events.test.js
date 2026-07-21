import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  officialStubFromWalletHint,
  parsePredictWalletEvent,
} from "./pf_wallet_events_parse.js";
import {
  ensureHouseApprovals,
  isPfHouseApprovalsSkipped,
  _resetHouseApprovalsStateForTests,
} from "./pf_house_approvals.js";
import {
  getHouseWalletSettlementHint,
  waitForHouseWalletSettlementHint,
  _ingestWalletEventForTests,
  _resetHouseWalletEventsForTests,
} from "./pf_wallet_events.js";

describe("parsePredictWalletEvent", () => {
  it("maps orderTransactionSuccess to filled with fill payload", () => {
    const h = parsePredictWalletEvent({
      type: "orderTransactionSuccess",
      orderHash: "0xabc",
      orderId: "99",
      fill: {
        executedSizeWei: "10000000000000000000",
        executedValueWei: "4000000000000000000",
      },
    });
    expect(h?.settlement).toBe("filled");
    expect(h?.orderHash).toBe("0xabc");
    expect(h?.executedSizeWei).toBe("10000000000000000000");
  });

  it("maps cancel/fail to unfilled", () => {
    expect(parsePredictWalletEvent({ type: "orderCancelled", orderHash: "0x1" })?.settlement).toBe("unfilled");
    expect(parsePredictWalletEvent({ type: "orderNotAccepted", orderHash: "0x1" })?.settlement).toBe("unfilled");
    expect(parsePredictWalletEvent({ type: "orderTransactionFailed", orderHash: "0x1" })?.settlement).toBe("unfilled");
    expect(parsePredictWalletEvent({ type: "orderExpired", orderHash: "0x1" })?.settlement).toBe("unfilled");
  });

  it("maps orderAccepted / Submitted to pending (keep waiting)", () => {
    expect(parsePredictWalletEvent({ type: "orderAccepted", orderHash: "0x1" })?.settlement).toBe("pending");
    expect(parsePredictWalletEvent({
      type: "orderTransactionSubmitted",
      orderHash: "0x1",
    })?.settlement).toBe("pending");
  });

  it("parses optional fee on orderTransactionSuccess", () => {
    const h = parsePredictWalletEvent({
      type: "orderTransactionSuccess",
      orderHash: "0xfee",
      fill: { executedSizeWei: "1" },
      fee: { amountWei: "2000000000000000000", type: "COLLATERAL" },
    });
    expect(h?.settlement).toBe("filled");
    expect(h?.feeAmountWei).toBe("2000000000000000000");
    expect(h?.feeType).toBe("COLLATERAL");
    const stub = officialStubFromWalletHint(h);
    expect(stub?.pfWalletFee?.amountWei).toBe("2000000000000000000");
  });

  it("unwraps type M envelope", () => {
    const h = parsePredictWalletEvent({
      type: "M",
      topic: "predictWalletEvents/jwt",
      data: { type: "orderExpired", orderHash: "0xdead" },
    });
    expect(h?.settlement).toBe("unfilled");
  });

  it("builds official stub", () => {
    const stub = officialStubFromWalletHint({
      orderHash: "0xabc",
      settlement: "filled",
      type: "orderTransactionSuccess",
      executedSizeWei: "1",
      executedValueWei: "2",
    });
    expect(stub?.status).toBe("FILLED");
    expect(stub?.order?.hash).toBe("0xabc");
  });
});

describe("house wallet hint store", () => {
  beforeEach(() => {
    _resetHouseWalletEventsForTests();
  });

  it("stores and retrieves hint by hash", () => {
    _ingestWalletEventForTests({
      type: "orderTransactionSuccess",
      orderHash: "0xAbC",
      fill: { executedSizeWei: "1" },
    });
    expect(getHouseWalletSettlementHint("0xabc")?.settlement).toBe("filled");
  });

  it("waitForHouseWalletSettlementHint resolves on event", async () => {
    const p = waitForHouseWalletSettlementHint("0xwait1", 2000);
    setTimeout(() => {
      _ingestWalletEventForTests({
        type: "orderCancelled",
        orderHash: "0xwait1",
      });
    }, 20);
    const hint = await p;
    expect(hint?.settlement).toBe("unfilled");
  });

  it("does not let pending overwrite terminal hint", () => {
    _ingestWalletEventForTests({
      type: "orderTransactionSuccess",
      orderHash: "0xkeep",
      fill: { executedSizeWei: "1" },
    });
    _ingestWalletEventForTests({
      type: "orderAccepted",
      orderHash: "0xkeep",
    });
    expect(getHouseWalletSettlementHint("0xkeep")?.settlement).toBe("filled");
    expect(getHouseWalletSettlementHint("0xkeep")?.type).toBe("orderTransactionSuccess");
  });
});

describe("ensureHouseApprovals", () => {
  beforeEach(() => {
    _resetHouseApprovalsStateForTests();
  });

  it("skips when env set", async () => {
    const prev = process.env.PF_HOUSE_SKIP_APPROVALS;
    process.env.PF_HOUSE_SKIP_APPROVALS = "1";
    _resetHouseApprovalsStateForTests();
    expect(isPfHouseApprovalsSkipped()).toBe(true);
    const setApprovals = vi.fn(async () => ({ success: true }));
    await ensureHouseApprovals({ setApprovals });
    expect(setApprovals).not.toHaveBeenCalled();
    if (prev == null)
      delete process.env.PF_HOUSE_SKIP_APPROVALS;
    else
      process.env.PF_HOUSE_SKIP_APPROVALS = prev;
  });

  it("calls setApprovals once on success", async () => {
    const prev = process.env.PF_HOUSE_SKIP_APPROVALS;
    delete process.env.PF_HOUSE_SKIP_APPROVALS;
    _resetHouseApprovalsStateForTests();
    const setApprovals = vi.fn(async () => ({ success: true }));
    await ensureHouseApprovals({ setApprovals });
    await ensureHouseApprovals({ setApprovals });
    expect(setApprovals).toHaveBeenCalledTimes(1);
    if (prev == null)
      delete process.env.PF_HOUSE_SKIP_APPROVALS;
    else
      process.env.PF_HOUSE_SKIP_APPROVALS = prev;
  });

  it("rethrows when setApprovals fails", async () => {
    const prev = process.env.PF_HOUSE_SKIP_APPROVALS;
    delete process.env.PF_HOUSE_SKIP_APPROVALS;
    _resetHouseApprovalsStateForTests();
    const setApprovals = vi.fn(async () => ({ success: false, cause: "no gas" }));
    await expect(ensureHouseApprovals({ setApprovals })).rejects.toThrow(/no gas/);
    if (prev == null)
      delete process.env.PF_HOUSE_SKIP_APPROVALS;
    else
      process.env.PF_HOUSE_SKIP_APPROVALS = prev;
  });
});
