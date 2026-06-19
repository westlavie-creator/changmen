import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { obForwardDefinition } from "../platforms/ob.js";
import { rayForwardDefinition, RAY_OFFICIAL_WS_URL } from "../platforms/ray.js";

describe("obForwardDefinition", () => {
  it("exposes browser path under /esport/ws-forward/", () => {
    assert.equal(obForwardDefinition.browserPath, "/esport/ws-forward/OB");
    assert.equal(obForwardDefinition.transport, "raw-ws");
  });

  it("requires upstream wss url in query u", () => {
    const upstream = obForwardDefinition.resolveUpstream({
      url: "http://localhost/esport/ws-forward/OB?u=wss%3A%2F%2Fmqtt.example%2Fws",
    });
    assert.equal(upstream.url, "wss://mqtt.example/ws");
  });

  it("rejects missing u query", () => {
    assert.throws(
      () => obForwardDefinition.resolveUpstream({ url: "http://localhost/esport/ws-forward/OB" }),
      /missing or invalid upstream query u/,
    );
  });
});

describe("rayForwardDefinition", () => {
  it("exposes browser path under /esport/ws-forward/", () => {
    assert.equal(rayForwardDefinition.browserPath, "/esport/ws-forward/RAY");
    assert.equal(rayForwardDefinition.transport, "raw-ws");
  });

  it("upstream targets official cfsocket with Origin and Authorization", () => {
    const upstream = rayForwardDefinition.resolveUpstream({
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(upstream.url, RAY_OFFICIAL_WS_URL);
    assert.equal(upstream.headers.Origin, "https://ray164.com");
    assert.equal(upstream.headers.Authorization, "Bearer test-token");
  });
});
