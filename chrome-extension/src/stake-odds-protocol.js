/** 对齐 A8 插件 `xn.send` → `chat message { channel: Stake }`，不连 47.115.75.57 */

export const STAKE_ODDS_PORT = "stake-odds";
export const STAKE_ODDS_PUSH_TYPE = "stakeOddsPush";
export const STAKE_ODDS_EVENT = "stakeOdds";

export function buildStakeOddsPush(channel, message) {
  return { type: STAKE_ODDS_PUSH_TYPE, channel, message };
}

export function buildStakeOddsEvent(message) {
  return { type: STAKE_ODDS_EVENT, channel: "Stake", message };
}

/**
 * @param {Set<{ postMessage(payload: unknown): void }>} ports
 * @param {unknown} message
 */
export function fanoutStakeOdds(ports, message) {
  const payload = buildStakeOddsEvent(message);
  for (const port of [...ports]) {
    try {
      port.postMessage(payload);
    } catch {
      ports.delete(port);
    }
  }
  return payload;
}
