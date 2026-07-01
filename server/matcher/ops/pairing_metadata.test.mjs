import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  applyPairingMetadata,
  classifyPairing,
  PAIRING_TIER,
  resolveEventAnchor,
} from "./pairing_metadata.js";
import { resetMatcherBehaviorForTest, setMatcherBehaviorForTest } from "../lib/config.js";

describe("pairing_metadata", () => {
  afterEach(() => {
    resetMatcherBehaviorForTest();
  });

  it("classifies id merge as verified", () => {
    const row = {
      Matchs: { OB: "1", RAY: "2" },
      MergeBasis: "id",
      HomeGbTeamId: "100",
      AwayGbTeamId: "200",
    };
    const r = classifyPairing(row, { matches: {} });
    assert.equal(r.tier, PAIRING_TIER.VERIFIED);
    assert.ok(r.confidence >= 0.9);
  });

  it("classifies name merge as provisional", () => {
    const row = {
      Matchs: { OB: "1", RAY: "2" },
      MergeBasis: "name",
    };
    const r = classifyPairing(row, { matches: {} });
    assert.equal(r.tier, PAIRING_TIER.PROVISIONAL);
  });

  it("classifies manual binding as verified", () => {
    const row = {
      Matchs: { OB: "1", RAY: "2" },
      MergeBasis: "name",
    };
    const matches = {
      OB: { "1": { SourceMatchID: "1", BindingSource: "manual" } },
      RAY: { "2": { SourceMatchID: "2", BindingSource: "auto_name" } },
    };
    const r = classifyPairing(row, { matches });
    assert.equal(r.tier, PAIRING_TIER.VERIFIED);
    assert.equal(r.bindingSource, "manual");
  });

  it("auto match_id without manual binding stays provisional", () => {
    const row = {
      Matchs: { OB: "1", RAY: "2" },
      MergeBasis: "name",
    };
    const matches = {
      OB: { "1": { SourceMatchID: "1", ClientMatchId: 9, BindingSource: "auto_name" } },
      RAY: { "2": { SourceMatchID: "2", ClientMatchId: 9, BindingSource: "auto_name" } },
    };
    const r = classifyPairing(row, { matches });
    assert.equal(r.tier, PAIRING_TIER.PROVISIONAL);
  });
  it("staging when fewer than two platforms", () => {
    const row = { Matchs: { OB: "1" }, MergeBasis: "id" };
    const r = classifyPairing(row, { matches: {} });
    assert.equal(r.tier, PAIRING_TIER.STAGING);
  });

  it("resolveEventAnchor prefers OB", () => {
    assert.equal(
      resolveEventAnchor({ OB: "99", RAY: "1" }),
      "OB:99",
    );
  });

  it("default publish filter excludes provisional name merge", () => {
    const matches = {};
    const rows = [{
      ID: 1,
      Matchs: { OB: "a", RAY: "b" },
      MergeBasis: "name",
    }];
    const { published } = applyPairingMetadata(rows, matches);
    assert.equal(published.length, 0);
  });

  it("publishProvisional=true includes provisional rows", () => {
    setMatcherBehaviorForTest({ publishProvisional: true, publishTierVerifiedOnly: false });
    const { published } = applyPairingMetadata(
      [{ ID: 1, Matchs: { OB: "a", RAY: "b" }, MergeBasis: "name" }],
      {},
    );
    assert.equal(published.length, 1);
    assert.equal(published[0].PairingTier, PAIRING_TIER.PROVISIONAL);
  });

  it("verified-only publish filter drops name-only rows", () => {
    setMatcherBehaviorForTest({ publishTierVerifiedOnly: true });
    const { published } = applyPairingMetadata(
      [{ ID: 1, Matchs: { OB: "a", RAY: "b" }, MergeBasis: "name" }],
      {},
    );
    assert.equal(published.length, 0);
  });

  it("publishProvisional=false drops provisional rows", () => {
    setMatcherBehaviorForTest({ publishProvisional: false });
    const { published } = applyPairingMetadata(
      [{ ID: 1, Matchs: { OB: "a", RAY: "b" }, MergeBasis: "name" }],
      {},
    );
    assert.equal(published.length, 0);
  });

  it("locked tier overrides provisional classification", () => {
    const locked = new Map([[42, { tier: "verified", confidence: 1 }]]);
    const { annotated } = applyPairingMetadata(
      [{ ID: 42, Matchs: { OB: "a", RAY: "b" }, MergeBasis: "name" }],
      {},
      { lockedTiers: locked },
    );
    assert.equal(annotated[0].PairingTier, PAIRING_TIER.VERIFIED);
    assert.equal(annotated[0].PairingTierLocked, true);
  });
});
