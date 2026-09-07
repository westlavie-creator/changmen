/**
 * OB 体育解码 / 港水 / 四分线 / 主盘 hpid 冒烟。
 */
import assert from "node:assert/strict";
import zlib from "node:zlib";
import {
  decodeObSportPbPayload,
  hkToDecimal,
  parseObHandicapLine,
  classifyObOutcome,
  listBetsFromObPlayData,
  extractObPlaySelections,
  playsFromObMatchRow,
} from "./sport_ob_odds.js";

assert.equal(hkToDecimal(0.81), 1.81);
assert.equal(hkToDecimal(-0.97), 2.031);
assert.equal(hkToDecimal(0), 0);
assert.equal(parseObHandicapLine("2.5/3"), 2.75);
assert.equal(parseObHandicapLine("-1.5"), -1.5);
assert.equal(parseObHandicapLine("0.5"), 0.5);

const payload = { livedata: [{ csid: "1", tid: "180", mids: "111" }] };
const gz = zlib.gzipSync(Buffer.from(JSON.stringify(payload), "utf8")).toString("base64");
const decoded = decodeObSportPbPayload({ code: "0000000", data: gz });
assert.deepEqual(decoded.livedata[0].mids, "111");

assert.equal(classifyObOutcome({ ot: "X", on: "和局" }, 1, 3), "draw");
assert.equal(classifyObOutcome({ otn: "主胜" }, 0, 3), "home");
assert.equal(classifyObOutcome({ otn: "客胜" }, 2, 3), "away");

const playData = [
  {
    hpid: "1",
    hpn: "全场独赢",
    hps: [{
      hl: [{
        hv: "",
        ol: [
          { oid: "h1", ov2: "0.90", otn: "主胜" },
          { oid: "d1", ov2: "3.20", otn: "和局" },
          { oid: "a1", ov2: "1.05", otn: "客胜" },
        ],
      }],
    }],
  },
  {
    hpid: "4",
    hpn: "全场让球",
    hps: [{
      hl: [{
        hv: "-0.5",
        ol: [
          { oid: "hs", ov2: "0.85", otn: "主" },
          { oid: "as", ov2: "0.95", otn: "客" },
        ],
      }],
    }],
  },
  {
    hpid: "2",
    hpn: "全场大小",
    hps: [{
      hl: [{
        hv: "2.5/3",
        ol: [
          { oid: "ov", ov2: "0.88", on: "大" },
          { oid: "un", ov2: "0.92", on: "小" },
        ],
      }],
    }],
  },
  {
    hpid: "14",
    hpn: "角球",
    hps: [{ hl: [{ hv: "9.5", ol: [{ oid: "c1", ov2: "0.8", on: "大" }] }] }],
  },
];

const list = listBetsFromObPlayData(playData);
assert.ok(list.some(b => b.marketCode === "moneyline" && b.drawOdds > 0));
assert.ok(list.some(b => b.marketCode === "spreads" && b.line === -0.5));
assert.ok(list.some(b => b.marketCode === "totals" && b.line === 2.75));
assert.equal(list.some(b => String(b.hpid) === "14"), false);

const extra = extractObPlaySelections(playData.find(p => p.hpid === "14"));
assert.equal(extra[0].marketCode, "ob:14");

const listRow = {
  mhn: "重庆铜梁龙",
  man: "上海申花",
  mid: "5450099",
  hpsData: [{
    hps: [
      {
        hpid: "1",
        hl: {
          ol: [
            { oid: "h1", ot: "1", onb: "主胜", on: "重庆铜梁龙", ov: 2000000 },
            { oid: "a1", ot: "2", onb: "客胜", on: "上海申花", ov: 107000 },
            { oid: "d1", ot: "X", onb: "平局", on: "平局", ov: 850000 },
          ],
        },
      },
      {
        hpid: "4",
        hl: {
          hv: "0",
          ol: [
            { oid: "hs", ot: "1", ov2: "0.89", on: "0" },
            { oid: "as", ot: "2", ov2: "0.97", on: "0" },
          ],
        },
      },
      {
        hpid: "2",
        hl: {
          hv: "3.5",
          ol: [
            { oid: "ov", ot: "Over", ov2: "0.96", on: "大 3.5" },
            { oid: "un", ot: "Under", ov2: "0.88", on: "小 3.5" },
          ],
        },
      },
    ],
    hpsAdd: [
      {
        hpid: "4",
        hl: [{
          hv: "-0.5",
          ol: [
            { oid: "hs2", ot: "1", ov2: "0.40", on: "-0.5" },
            { oid: "as2", ot: "2", ov2: "-0.54", on: "+0.5" },
          ],
        }],
      },
      {
        hpid: "17",
        hl: {
          ol: [
            { oid: "hh", ot: "1", onb: "主胜", ov: 185000 },
            { oid: "ha", ot: "2", onb: "客胜", ov: 210000 },
            { oid: "hd", ot: "X", onb: "平局", ov: 320000 },
          ],
        },
      },
    ],
  }],
};
const fromList = listBetsFromObPlayData(playsFromObMatchRow(listRow));
assert.ok(fromList.some(b => b.marketCode === "moneyline" && b.homeOdds === 20 && b.drawOdds === 8.5));
assert.ok(fromList.some(b => b.marketCode === "spreads" && b.line === 0));
assert.ok(fromList.some(b => b.marketCode === "spreads" && b.line === -0.5));
assert.ok(fromList.some(b => b.marketCode === "totals" && b.line === 3.5));
assert.ok(fromList.some(b => b.marketCode === "ht_moneyline" && b.homeOdds === 1.85));
assert.equal(playsFromObMatchRow([]).length, 0);

const cornerRow = {
  playData: [{ hpid: "1", hpn: "独赢", hl: { ol: [{ oid: "x", ov2: "0.9", otn: "主胜" }] } }],
  hpsCorner: [{
    hpid: "114",
    hpn: "角球大小",
    hl: [{ hv: "9.5", ol: [{ oid: "c1", ov2: "0.8", on: "大" }, { oid: "c2", ov2: "0.9", on: "小" }] }],
  }],
};
const withCorner = playsFromObMatchRow(cornerRow);
assert.equal(withCorner.length, 2);
assert.equal(withCorner[1].hpid, "114");
const cornerList = listBetsFromObPlayData(withCorner);
assert.ok(cornerList.some(b => b.marketCode === "ob:114" && b.line === 9.5));

console.log("sport_ob_odds.smoke: ok");
