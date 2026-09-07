import { describe, expect, it } from "vitest";
import {
  looksLikeMqttUrl,
  parseObSportPushOdds,
  resolveObSportWsUrl,
} from "@/runtime/obSportWs";

describe("obSportWs", () => {
  it("uses explicit wss url; https in wsUrl is not a socket", () => {
    expect(resolveObSportWsUrl({ wsUrl: "wss://push.example/ws" })).toBe("wss://push.example/ws");
    expect(resolveObSportWsUrl({ wsUrl: "https://api.example", token: "abc" })).toBe("");
    expect(resolveObSportWsUrl({})).toBe("");
  });

  it("derives yewuws2/push from HTTP gateway + token", () => {
    expect(resolveObSportWsUrl({
      gateway: "https://api.jpbfa750.com",
      token: "deadbeef",
    })).toBe("wss://api.jpbfa750.com/yewuws2/push?requestId=deadbeef");
    expect(resolveObSportWsUrl({
      gateway: "https://api.jpbfa750.com/",
      token: "deadbeef",
    })).toBe("wss://api.jpbfa750.com/yewuws2/push?requestId=deadbeef");
    expect(resolveObSportWsUrl({ gateway: "https://api.jpbfa750.com" })).toBe("");
  });

  it("detects mqtt urls and not panda push path", () => {
    expect(looksLikeMqttUrl("wss://mqtt.example:8084/mqtt")).toBe(true);
    expect(looksLikeMqttUrl("wss://push.example/ws")).toBe(false);
    expect(looksLikeMqttUrl("wss://api.example/yewuws2/push?requestId=x")).toBe(false);
  });

  it("parses hk ov2 push into decimal odds", () => {
    const rows = parseObSportPushOdds({
      oid: "abc",
      ov2: "0.90",
    });
    expect(rows).toEqual([{ oid: "abc", odds: 1.9 }]);
  });
});
