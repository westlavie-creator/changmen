import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { iaForwardDefinition, IA_OFFICIAL_WS, IA_OFFICIAL_WS_PATH } from "../platforms/ia.js";

describe("iaForwardDefinition", () => {
  it("uses socket.io transport", () => {
    assert.equal(iaForwardDefinition.transport, "socket.io");
  });

  it("exposes browser path under /esport/ws-forward/", () => {
    assert.equal(iaForwardDefinition.browserPath, "/esport/ws-forward/IA");
  });

  it("upstream targets official socket.ajj123.net with ilustre Origin", () => {
    const { url, options } = iaForwardDefinition.buildUpstream("https://ilustre-analytics.org");
    assert.equal(url, IA_OFFICIAL_WS);
    assert.equal(options.path, IA_OFFICIAL_WS_PATH);
    assert.deepEqual(options.extraHeaders, { Origin: "https://ilustre-analytics.org" });
    assert.deepEqual(options.auth, { token: "123" });
  });

  it("strips trailing slash from gateway Origin", () => {
    const { options } = iaForwardDefinition.buildUpstream("https://ilustre-analytics.org/");
    assert.equal(options.extraHeaders.Origin, "https://ilustre-analytics.org");
  });
});
