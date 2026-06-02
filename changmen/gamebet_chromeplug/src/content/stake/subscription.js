import { PLATFORMS } from "../platforms.js";
import { generateUuid, tabHttpPost } from "../utils.js";

const STAKE_MARKET_RE = /(比赛获胜者 - Two 路线)|(地图\d获胜者 - Two 路线)/;

export const FIXTURE_SUBSCRIPTION = `subscription  SportFixtureDataMatch_SportFixture($fixtureId: String!, $groups: [String!]) {
  sportFixtureMarketsNext(fixtureId: $fixtureId, groups: $groups) {
    id
    name
    status
    extId
    provider
    outcomes {
      id
      active
      odds
      name
      extId
    }
  }
}`;

class BidirectionalMap {
  constructor() {
    this.forward = new Map();
    this.backward = new Map();
  }

  set(key, value) {
    this.forward.set(key, value);
    this.backward.set(value, key);
  }

  hasKey(key) {
    return this.forward.has(key);
  }

  getByKey(key) {
    return this.forward.get(key);
  }

  getByValue(value) {
    return this.backward.get(value);
  }

  deleteByKey(key) {
    const value = this.forward.get(key);
    if (value) {
      this.forward.delete(key);
      this.backward.delete(value);
    }
  }

  keys() {
    return [...this.forward.keys()];
  }

  clear() {
    this.forward.clear();
    this.backward.clear();
  }
}

const subscribeMap = new BidirectionalMap();

/** @type {{ send(payload: unknown): void } | null} */
let a8Bridge = null;
/** @type {{ send(text: string): void; close?(): void } | null} */
let gqlSocket = null;

export function setStakeA8Bridge(bridge) {
  a8Bridge = bridge;
}

export function setStakeGqlSocket(socket) {
  gqlSocket = socket;
}

export function clearStakeSubscriptions() {
  subscribeMap.clear();
}

export function handleFixtureNext(payload, subscriptionId) {
  if (!subscriptionId || !payload?.data?.sportFixtureMarketsNext) return;
  const matchId = subscribeMap.getByValue(subscriptionId);
  if (!matchId) return;

  const message = { matchId, bets: [] };
  for (const market of payload.data.sportFixtureMarketsNext) {
    const name = market.name;
    const betId = market.id;
    if (!STAKE_MARKET_RE.test(name) || market.outcomes?.length !== 2) continue;
    const home = market.outcomes[0];
    const away = market.outcomes[1];
    const locked = !["active", "live"].includes(market.status);
    message.bets.push({
      betId,
      name,
      homeId: home.id,
      home: !locked && home.active ? home.odds : 0,
      awayId: away.id,
      away: !locked && away.active ? away.odds : 0,
      extend: { status: market.status, home, away },
    });
  }
  a8Bridge?.send(message);
}

/** 对齐 A8 `Pn` */
export function syncStakeSubscriptions(rows) {
  if (!gqlSocket) return;
  const list = Array.isArray(rows) ? rows : [];

  for (const fixtureId of subscribeMap.keys()) {
    if (!list.some((r) => r.id === fixtureId)) {
      const subId = subscribeMap.getByKey(fixtureId);
      if (subId) {
        gqlSocket.send(JSON.stringify({ id: subId, type: "complete" }));
        subscribeMap.deleteByKey(fixtureId);
      }
    }
  }

  for (const row of list) {
    if (subscribeMap.hasKey(row.id)) continue;
    const subId = generateUuid();
    gqlSocket.send(
      JSON.stringify({
        id: subId,
        type: "subscribe",
        payload: {
          query: FIXTURE_SUBSCRIPTION,
          variables: {
            fixture: row.slug,
            fixtureId: row.id,
            provider: "oddin",
            groups: ["winner", "maps"],
          },
        },
      }),
    );
    subscribeMap.set(row.id, subId);
  }
}

export function createStakeMessageHandler() {
  return async function handleStakeTabMessage(message) {
    console.log(PLATFORMS.Stake, `收到请求${message.type}`, message.data);
    switch (message.type) {
      case "POST": {
        if (!message.url) {
          console.error("url 为空");
          return undefined;
        }
        const response = await tabHttpPost(message.url, message.data, message.options);
        console.log(PLATFORMS.Stake, "tabId请求返回 => ", response);
        return response;
      }
      case "":
        syncStakeSubscriptions(message.data);
        return undefined;
      default:
        return undefined;
    }
  };
}
