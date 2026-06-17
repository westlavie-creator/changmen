import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultUserConfig } from "@/types/userConfig";
import type { ViewBet, ViewMatch } from "@/models/match";

const notifyArbOpportunityForBet = vi.hoisted(() => vi.fn());
const executeArbBetMock = vi.hoisted(() => vi.fn(async () => {}));
const arbExecutionFollowUpMessage = vi.hoisted(() => vi.fn());

vi.mock("@/extensions/arbBet/arbOpportunityScan", () => ({
  notifyArbOpportunityForBet,
}));

vi.mock("@/stores/betting/autoBet/executeArbBet", () => ({
  executeArbBet: executeArbBetMock,
}));

vi.mock("@/stores/messageStore", () => ({
  useMessageStore: () => ({
    arbExecutionFollowUpMessage,
  }),
}));

import { resetOpportunityLinkForTest } from "@/extensions/arbBet/arbOpportunityLink";
import { processArbBet } from "@/extensions/arbBet/processArbBet";

const match = { id: 1, title: "A vs B" } as unknown as ViewMatch;
const bet = { id: 2 } as unknown as ViewBet;

describe("processArbBet", () => {
  beforeEach(() => {
    notifyArbOpportunityForBet.mockClear();
    executeArbBetMock.mockClear();
    arbExecutionFollowUpMessage.mockClear();
    resetOpportunityLinkForTest();
  });

  it("notifies then executes when opportunity round and betting on", async () => {
    const config = createDefaultUserConfig();
    config.betting = true;
    const calls: string[] = [];
    notifyArbOpportunityForBet.mockImplementation(() => {
      calls.push("notify");
      return { sent: true, canOrder: true };
    });
    executeArbBetMock.mockImplementation(async () => {
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
    expect(executeArbBetMock).not.toHaveBeenCalled();
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
    expect(executeArbBetMock).toHaveBeenCalledOnce();
  });

  it("sends execution follow-up when can-order opportunity had no outcome message", async () => {
    const config = createDefaultUserConfig();
    config.betting = true;
    notifyArbOpportunityForBet.mockReturnValue({ sent: true, canOrder: true });

    await processArbBet({
      match,
      bet,
      config,
      setMessage: () => {},
      notifyOpportunity: true,
    });

    expect(arbExecutionFollowUpMessage).toHaveBeenCalledOnce();
  });
});
