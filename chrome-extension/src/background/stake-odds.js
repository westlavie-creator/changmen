import { STAKE_ODDS_PORT, STAKE_ODDS_PUSH_TYPE, fanoutStakeOdds } from "../stake-odds-protocol.js";

/** @type {Set<chrome.runtime.Port>} */
const ports = new Set();

export { STAKE_ODDS_PORT };

export function attachStakeOddsPort(port) {
  if (!port) return;
  ports.add(port);
  port.onDisconnect.addListener(() => {
    ports.delete(port);
  });
}

export function handleStakeOddsPush(message) {
  if (message?.type !== STAKE_ODDS_PUSH_TYPE) return false;
  fanoutStakeOdds(ports, message.message);
  return true;
}

export function stakeOddsPortCount() {
  return ports.size;
}
