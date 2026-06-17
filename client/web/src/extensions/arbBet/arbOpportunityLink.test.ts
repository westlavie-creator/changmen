import { describe, expect, it } from "vitest";
import {
  clearOpportunityPending,
  hasOpportunityPending,
  markOpportunityPending,
  resetOpportunityLinkForTest,
} from "@/extensions/arbBet/arbOpportunityLink";

describe("arbOpportunityLink", () => {
  it("tracks pending per match:bet", () => {
    resetOpportunityLinkForTest();
    expect(hasOpportunityPending(1, 2)).toBe(false);
    markOpportunityPending(1, 2);
    expect(hasOpportunityPending(1, 2)).toBe(true);
    clearOpportunityPending(1, 2);
    expect(hasOpportunityPending(1, 2)).toBe(false);
  });
});
