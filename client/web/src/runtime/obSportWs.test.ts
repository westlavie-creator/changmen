import { describe, expect, it } from "vitest";
import {
  buildObSportC8Subscribe,
  isObSportC8Mid,
  looksLikeMqttUrl,
  obSportRawLooksLikeClock,
  parseObSportPushOdds,
  resolveObSportWsUrl,
  trimObSportPushBacklog,
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

  it("skips odds walk on C102 clock pushes", () => {
    expect(parseObSportPushOdds({
      cmd: "C102",
      cd: { mid: "m1", mmp: "6", mst: 2781, oid: "noise", ov2: "0.90" },
    })).toEqual([]);
    expect(obSportRawLooksLikeClock(JSON.stringify({ cmd: "C102", cd: { mid: "m1" } }))).toBe(true);
    expect(obSportRawLooksLikeClock(JSON.stringify({ cmd: "C105", cd: {} }))).toBe(false);
  });

  it("keeps the latest C102 per mid when the push queue backs up", () => {
    const q = [
      JSON.stringify({ cmd: "C102", cd: { mid: "5652292", mst: 10 } }),
      JSON.stringify({ cmd: "C105", cd: { mid: "5652292" } }),
      JSON.stringify({ cmd: "C102", cd: { mid: "5652292", mst: 40 } }),
      JSON.stringify({ cmd: "C103", cd: { mid: "5652292", msc: ["S0|1:0"] } }),
    ];
    while (q.length < 24)
      q.unshift(JSON.stringify({ cmd: "C0" }));
    trimObSportPushBacklog(q);
    const cmds = q.map(x => JSON.parse(String(x)).cmd);
    expect(cmds).toContain("C105");
    expect(cmds).toContain("C103");
    expect(cmds.filter(c => c === "C102")).toEqual(["C102"]);
    expect(q.some(x => String(x).includes('"mst":40'))).toBe(true);
  });

  it("parses hk ov2 push into decimal odds", () => {
    const rows = parseObSportPushOdds({
      oid: "abc",
      ov2: "0.90",
    });
    expect(rows).toEqual([{ oid: "abc", odds: 1.9 }]);
  });

  it("builds C8 subscribe from mids like official PC list", () => {
    const payload = buildObSportC8Subscribe(["5650335", "5661096", "2097200625505820674"]);
    expect(payload.cmd).toBe("C8");
    expect(payload.cufm).toBe("L");
    expect(payload.marketLevel).toBe("0");
    expect(payload.list).toEqual([
      { mid: "5650335", hpid: "1,2,4,17,18,19", level: 13 },
      { mid: "5661096", hpid: "1,2,4,17,18,19", level: 13 },
    ]);
    expect(isObSportC8Mid("5652292")).toBe(true);
    expect(isObSportC8Mid("2097200625505820674")).toBe(false);
  });

  it("unwraps worker data/payload envelopes before C105", () => {
    const rows = parseObSportPushOdds({
      data: {
        payload: {
          cmd: "C105",
          cd: {
            hls: [{ ol: [{ oid: "h1", ov2: "0.90", os: 1 }] }],
          },
        },
      },
    });
    expect(rows).toEqual([{ oid: "h1", odds: 1.9 }]);
  });

  it("parses C105 ol outcomes including locked os=2", () => {
    const rows = parseObSportPushOdds({
      cmd: "C105",
      cd: {
        hls: [
          {
            hpid: "4",
            hs: 0,
            ol: [
              { oid: "h1", ov2: "0.92", os: 1 },
              { oid: "a1", ov2: "-0.95", os: 2 },
            ],
          },
        ],
      },
    });
    const byOid = Object.fromEntries(rows.map(r => [r.oid, r.odds]));
    expect(byOid.h1).toBe(1.92);
    expect(byOid.a1).toBe(0);
  });

  it("parses C105 ov milli-odds and hv line", () => {
    const rows = parseObSportPushOdds({
      cmd: "C105",
      cd: {
        mid: "m1",
        hls2: {
          4: [{
            hpid: "4",
            hs: 0,
            hv: "-0.5",
            ol: [
              { oid: "h1", ov: "203000", ov2: "-0.95", os: 1, ot: "1" },
              { oid: "a1", ov: "179000", ov2: "0.81", os: 1, ot: "2" },
            ],
          }],
        },
      },
    });
    expect(rows).toEqual([
      { oid: "h1", odds: 2.053, line: -0.5, mid: "m1" },
      { oid: "a1", odds: 1.81, line: -0.5, mid: "m1" },
    ]);
  });

  it("locks whole C105 line when hs=2", () => {
    const rows = parseObSportPushOdds({
      cmd: "C105",
      cd: {
        hls: [{
          hs: 2,
          hv: "1.5",
          ol: [{ oid: "x", ov2: "0.90", os: 1 }],
        }],
      },
    });
    expect(rows).toEqual([{ oid: "x", odds: 0, line: 1.5 }]);
  });
});
