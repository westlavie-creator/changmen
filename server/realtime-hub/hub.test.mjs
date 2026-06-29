import assert from "node:assert/strict";
import test from "node:test";
import { PM_SPORT_CHANNEL, REALTIME_SOCKET_PATH, isChangmenRealtimeHttpPath } from "./channels.js";
import { isLocalInternalRequest } from "./internal_http.js";

test("realtime hub paths", () => {
  assert.equal(PM_SPORT_CHANNEL, "Polymarket:PmSport");
  assert.ok(REALTIME_SOCKET_PATH.includes("/esport/realtime"));
  assert.equal(isChangmenRealtimeHttpPath("/esport/realtime/socket.io/"), true);
  assert.equal(isChangmenRealtimeHttpPath("/esport/ws-forward/OB"), false);
});

test("isLocalInternalRequest accepts loopback", () => {
  assert.equal(isLocalInternalRequest({
    headers: { host: "127.0.0.1:3560" },
    socket: { remoteAddress: "127.0.0.1" },
  }), true);
  assert.equal(isLocalInternalRequest({
    headers: { host: "example.com" },
    socket: { remoteAddress: "127.0.0.1" },
  }), false);
});
