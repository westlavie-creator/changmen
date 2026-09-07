/**
 * 体育 OB 会话解析：拒电竞 blob，收 kind=sport。
 */
import assert from "node:assert/strict";
import {
  deriveObSportPushUrl,
  looksLikeEsportObCollect,
  looksLikeSportObCollect,
  looksLikeSportObCollectPaste,
  mergeIncomingSportObSession,
  parseSportObSessionInput,
  resolveSportObPushUrl,
} from "./sport_ob_session.js";

const esport = {
  provider: "OB",
  gateway: ["https://api-esport.example.com"],
  token: "1234567890123456789",
  referer: "https://dj-pc.example.com/",
};
assert.equal(looksLikeEsportObCollect(esport), true);
assert.equal(looksLikeSportObCollect(esport), false);
assert.equal(parseSportObSessionInput(esport).ok, false);

const sport = {
  provider: "OB",
  kind: "sport",
  gateway: ["https://api.937kddt.com"],
  token: "3d2d98226690510f2575b5d4c7a2de26f9b5e666",
  sessionId: "53595220421405155817865073474811",
};
assert.equal(looksLikeSportObCollect(sport), true);
assert.equal(looksLikeEsportObCollect(sport), false);
const parsed = parseSportObSessionInput(sport);
assert.equal(parsed.ok, true);
assert.equal(parsed.ok && parsed.session.kind, "sport");
assert.equal(parsed.ok && parsed.session.gateway, "https://api.937kddt.com");

const b64 = Buffer.from(JSON.stringify(sport), "utf8").toString("base64");
assert.equal(parseSportObSessionInput(b64).ok, true);

assert.equal(
  looksLikeSportObCollectPaste({ provider: "OB", token: sport.token }),
  true,
);
assert.equal(
  looksLikeSportObCollectPaste({ provider: "OB", token: esport.token }),
  false,
);

assert.equal(
  deriveObSportPushUrl("https://api.jpbfa750.com", "deadbeef"),
  "wss://api.jpbfa750.com/yewuws2/push?requestId=deadbeef",
);
assert.equal(
  resolveSportObPushUrl({ gateway: "https://api.jpbfa750.com", token: "deadbeef", wsUrl: "" }),
  "wss://api.jpbfa750.com/yewuws2/push?requestId=deadbeef",
);
assert.equal(resolveSportObPushUrl({ wsUrl: "wss://push.example/ws" }), "wss://push.example/ws");
assert.equal(resolveSportObPushUrl({ wsUrl: "https://api.example", token: "deadbeef" }), "");

const kept = mergeIncomingSportObSession(
  {
    kind: "sport",
    token: "107491c69123e556f0817167dbab6b59e06116be",
    sessionId: "1",
    gateway: "",
    referer: "https://user-pc-new.janbo0931.com/",
    wsUrl: "",
  },
  { gateway: "https://api.jpbfa750.com", lastGateway: "https://api.jpbfa750.com" },
);
assert.equal(kept.gateway, "https://api.jpbfa750.com");
assert.equal(
  kept.wsUrl,
  "wss://api.jpbfa750.com/yewuws2/push?requestId=107491c69123e556f0817167dbab6b59e06116be",
);

const hinted = mergeIncomingSportObSession(
  { token: "aa", gateway: [] },
  null,
  "https://api.etx7rn0.com",
);
assert.equal(hinted.gateway, "https://api.etx7rn0.com");

console.log("sport_ob_session.smoke: ok");
