import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { unzipObSportPushCd } from "@/runtime/obSportCodec";
import { parseObSportPushOdds } from "@/runtime/obSportWs";

describe("unzipObSportPushCd", () => {
  it("inflates official-style zlib+base64 C105 cd", async () => {
    const inner = {
      mid: "m1",
      hls: [{
        hpid: "4",
        hs: 0,
        hv: "-0.5",
        ol: [
          { oid: "h1", ov: "203000", ov2: "-0.95", os: 1, ot: "1" },
          { oid: "a1", ov: "179000", ov2: "0.81", os: 1, ot: "2" },
        ],
      }],
    };
    const b64 = deflateSync(Buffer.from(JSON.stringify(inner))).toString("base64");
    const cd = await unzipObSportPushCd(b64);
    const rows = parseObSportPushOdds({ cmd: "C105", cd });
    expect(rows.map(r => r.oid)).toEqual(["h1", "a1"]);
    expect(rows[0]?.odds).toBeGreaterThan(1);
  });
});
