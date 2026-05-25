"use strict";

const { assertBetRef } = require("./bet_ref.js");
const obBet = require("../platforms/ob/ob_bet.js");

const adapters = {
  OB: obBet,
};

/**
 * @param {import("./bet_ref.js").BetRef} betRef
 * @param {number} amount
 */
async function checkBet(betRef, amount) {
  const ref = assertBetRef(betRef);
  const adapter = adapters[ref.platform];
  if (!adapter) throw new Error(`unsupported platform: ${ref.platform}`);
  const amt = Math.round(Number(amount));
  if (!amt || amt < 1) throw new Error("amount must be >= 1");
  return adapter.checkBet(ref, amt);
}

/**
 * @param {import("./bet_ref.js").BetRef} betRef
 * @param {number} amount
 * @param {object} [options]
 * @param {object} [options.payload] checkBet 返回的 payload
 */
async function placeBet(betRef, amount, options = {}) {
  const ref = assertBetRef(betRef);
  const adapter = adapters[ref.platform];
  if (!adapter) throw new Error(`unsupported platform: ${ref.platform}`);
  const amt = Math.round(Number(amount));
  if (!amt || amt < 1) throw new Error("amount must be >= 1");
  if (!options.payload) throw new Error("placeBet requires check payload; call checkBet first");
  return adapter.placeBet(ref, amt, options.payload);
}

function supportedPlatforms() {
  return Object.keys(adapters);
}

module.exports = {
  checkBet,
  placeBet,
  supportedPlatforms,
};
