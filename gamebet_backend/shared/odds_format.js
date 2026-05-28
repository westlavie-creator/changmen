"use strict";

/** 赔率统一保留 3 位小数（与 TJ01 / A8 展示一致） */
function formatOdds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n === 0) return 0;
  return Math.round(n * 1000) / 1000;
}

function formatBetOdds(bet) {
  if (!bet || typeof bet !== "object") return bet;
  return {
    ...bet,
    HomeOdds: formatOdds(bet.HomeOdds),
    AwayOdds: formatOdds(bet.AwayOdds),
  };
}

module.exports = {
  formatOdds,
  formatBetOdds,
};
