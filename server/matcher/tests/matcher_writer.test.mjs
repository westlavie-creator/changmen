import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  getMatcherWriter,
  isComposerWriter,
  isLegacyWriter,
} from "../lib/matcher_writer.js";
import {
  __resetMatcherSideEngineWarnForTests,
  getMatcherSideEngine,
  isProjectorSideEngine,
} from "../lib/side_engine.js";

const prevWriter = process.env.MATCHER_WRITER;
const prevSide = process.env.MATCHER_SIDE_ENGINE;

afterEach(() => {
  if (prevWriter === undefined)
    delete process.env.MATCHER_WRITER;
  else
    process.env.MATCHER_WRITER = prevWriter;
  if (prevSide === undefined)
    delete process.env.MATCHER_SIDE_ENGINE;
  else
    process.env.MATCHER_SIDE_ENGINE = prevSide;
  __resetMatcherSideEngineWarnForTests();
});

describe("matcher_writer", () => {
  it("defaults to composer when unset", () => {
    delete process.env.MATCHER_WRITER;
    assert.equal(getMatcherWriter(), "composer");
    assert.equal(isComposerWriter(), true);
    assert.equal(isLegacyWriter(), false);
  });

  it("accepts legacy aliases", () => {
    process.env.MATCHER_WRITER = "legacy";
    assert.equal(getMatcherWriter(), "legacy");
    process.env.MATCHER_WRITER = "match-merge";
    assert.equal(getMatcherWriter(), "legacy");
  });

  it("unknown values fall back to composer", () => {
    process.env.MATCHER_WRITER = "wat";
    assert.equal(getMatcherWriter(), "composer");
  });
});

describe("side_engine under composer writer", () => {
  it("ignores MATCHER_SIDE_ENGINE=projector", () => {
    process.env.MATCHER_WRITER = "composer";
    process.env.MATCHER_SIDE_ENGINE = "projector";
    assert.equal(getMatcherSideEngine(), "legacy");
    assert.equal(isProjectorSideEngine(), false);
  });

  it("allows projector only under legacy writer", () => {
    process.env.MATCHER_WRITER = "legacy";
    process.env.MATCHER_SIDE_ENGINE = "projector";
    assert.equal(getMatcherSideEngine(), "projector");
    assert.equal(isProjectorSideEngine(), true);
  });
});
