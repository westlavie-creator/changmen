import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserConfig } from "@/types/userConfig";
import type { ViewBet, ViewMatch } from "@/models/match";

const notifyArbOpportunityForBet = vi.fn();
const executeArbBet = vi.fn(async () => {});

vi.mock("@/extensions/arbBet/arbOpportunityScan", () => ({
  notifyArbOpportunityForBet: (...args: unknown[]) => notifyArbOpportunityForBet(...args),
}));

vi.mock("@/stores/betting/autoBet/executeArbBet", () => ({
  executeArbBet: (...args: unknown[]) => executeArbBet(...args),
}));

import { processArbBet } from "@/extensions/arbBet/processArbBet";

const match = { id: 1, title: "A vs B" } as unknown as ViewMatch;
const bet = { id: 2 } as unknown as ViewBet;

describe("processArbBet", () => {
  beforeEach(() => {
    notifyArbOpportunityForBet.mockClear();
    executeArbBet.mockClear();
  });

  it("notifies then executes when opportunity round and betting on", async () => {
    const config = createDefaultUserConfig();
    config.betting = true;
    const calls: string[] = [];
    notifyArbOpportunityForBet.mockImplementation(() => {
      calls.push("notify");
    });
    executeArbBet.mockImplementation(async () => {
      calls.push("execute");
    });

    await processArbBet({
      match,
      bet,
      config,
      setMessage: () => {},
      notifyOpportunity: true,
    });

    expect(calls).toEqual(["notify", "execute"]);
  });

  it("skips execute when betting off", async () => {
    const config = createDefaultUserConfig();
    config.betting = false;

    await processArbBet({
      match,
      bet,
      config,
      setMessage: () => {},
      notifyOpportunity: true,
    });

    expect(notifyArbOpportunityForBet).toHaveBeenCalledOnce();
    expect(executeArbBet).not.toHaveBeenCalled();
  });

  it("skips notify when not an opportunity round", async () => {
    const config = createDefaultUserConfig();
    config.betting = true;

    await processArbBet({
      match,
      bet,
      config,
      setMessage: () => {},
      notifyOpportunity: false,
    });

    expect(notifyArbOpportunityForBet).not.toHaveBeenCalled();
    expect(executeArbBet).toHaveBeenCalledOnce();
  });
});
