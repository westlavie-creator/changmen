const assert = require("assert");

const {
  parseObEntryUrl,
  normalizeGameIndex,
  normalizeGameView,
  parseMqttTopic,
  applyOddsUpdate
} = require("../core");

function run() {
  const addr = Buffer.from(JSON.stringify({
    api: ["https://api-a.example:8105"],
    cdn: ["https://cdn.example"],
    img_url: ["https://img.example/"],
    mqtt: ["wss://mqtt.example/mqtt"]
  })).toString("base64");

  const entry = parseObEntryUrl(`https://ob.example/home?token=tok123&lang=cn&domain=default&addr=${encodeURIComponent(addr)}`);
  assert.equal(entry.token, "tok123");
  assert.equal(entry.lang, "cn");
  assert.deepEqual(entry.addr.api, ["https://api-a.example:8105"]);
  assert.deepEqual(entry.addr.mqtt, ["wss://mqtt.example/mqtt"]);

  const matches = normalizeGameIndex({
    status: "true",
    data: [{
      id: "5385124130449945",
      game_id: "cs2",
      match_team: "Home&nbsp;Team,Away Team",
      team_id: "101,202",
      bo: 3,
      start_time: 1770000000
    }]
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchId, "5385124130449945");
  assert.equal(matches[0].home.name, "Home Team");

  const markets = normalizeGameView("5385124130449945", 1, {
    status: "true",
    data: [{
      id: "m1",
      round: 1,
      cn_name: "胜负",
      status: 6,
      visible: 1,
      suspended: 0,
      odds: {
        a: { id: "o-home", name: "@T1", odd: "1.82" },
        b: { id: "o-away", name: "@T2", odd: 1.96 }
      }
    }]
  });
  assert.equal(markets.length, 1);
  assert.equal(markets[0].odds.length, 2);
  assert.equal(markets[0].odds[0].odd, 1.82);
  assert.equal(markets[0].locked, false);

  assert.deepEqual(parseMqttTopic("/market/oddsUpdate/5385124130449945"), {
    topic: "/market/oddsUpdate/",
    matchId: "5385124130449945",
    type: "market.oddsUpdate"
  });

  const state = { currentOdds: {} };
  applyOddsUpdate(state, {
    topic: "/market/oddsUpdate/",
    matchId: "5385124130449945",
    payload: [{ id: "o-home", odd: 1.88, market_id: "m1" }]
  });
  assert.equal(state.currentOdds["o-home"].odd, 1.88);
  assert.equal(state.currentOdds["o-home"].marketId, "m1");
}

run();
console.log("core tests passed");
