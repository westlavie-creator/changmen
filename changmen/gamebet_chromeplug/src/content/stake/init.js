import { PLATFORMS } from "../platforms.js";
import { getCookie } from "../utils.js";
import { STAKE_LOCKDOWN_TOKEN } from "../config.js";
import { createA8Bridge } from "./a8-bridge.js";
import { GraphqlTransportWs } from "./graphql-ws.js";
import {
  clearStakeSubscriptions,
  createStakeMessageHandler,
  handleFixtureNext,
  setStakeA8Bridge,
  setStakeGqlSocket,
} from "./subscription.js";

/**
 * stake.com 页：setTab + GraphQL WS 订阅 + A8 桥接
 * @param {(handler: ReturnType<typeof createStakeMessageHandler>) => void} registerHandler
 */
export function initStakePage(registerHandler) {
  if (location.hostname !== "stake.com") return;

  const handler = createStakeMessageHandler();
  registerHandler(handler);

  chrome.runtime.sendMessage(
    { type: "setTab", uuid: Date.now().toString(), data: { key: PLATFORMS.Stake } },
    (response) => {
      console.log(PLATFORMS.Stake, "tabId 成功写入 => ", response?.response ?? response);
    },
  );

  const session = getCookie("session");
  if (!session) {
    console.warn("[Stake] 未找到 session cookie，跳过 GraphQL WS");
    return;
  }

  const bridge = createA8Bridge(PLATFORMS.Stake);
  setStakeA8Bridge(bridge);

  const gql = new GraphqlTransportWs("/_api/websockets", "graphql-transport-ws");
  setStakeGqlSocket(gql);

  gql.onopen = () => {
    gql.send(
      JSON.stringify({
        type: "connection_init",
        payload: {
          accessToken: session,
          language: "zh",
          lockdownToken: STAKE_LOCKDOWN_TOKEN,
        },
      }),
    );
    gql.startPing();
  };

  gql.onmessage = (event) => {
    let packet;
    try {
      packet = JSON.parse(event.data);
    } catch {
      return;
    }
    switch (packet.type) {
      case "connection_ack":
        clearStakeSubscriptions();
        break;
      case "complete":
        console.error(PLATFORMS.Stake, "订阅失败", packet);
        break;
      case "next":
        handleFixtureNext(packet.payload, packet.id);
        break;
      default:
        break;
    }
    console.log(PLATFORMS.Stake, "message", packet.type);
  };

  gql.onclose = () => console.log("[Stake] graphql ws closed");
  gql.onerror = (err) => console.error("[Stake] graphql ws error", err);
}
