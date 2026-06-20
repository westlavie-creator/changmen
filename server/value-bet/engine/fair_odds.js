/**
 * 从锐利盘口（PB/Pinnacle）赔率中去除 vig，得到"真实概率"和公平赔率。
 *
 * 支持两种去 vig 方法：
 *  - multiplicative（等比缩放，默认）：假设 vig 按概率等比分摊
 *  - additive（等量分摊）：假设 vig 均分给两边
 *
 * Pinnacle 电竞 overround 通常 1.03~1.06。
 */

/**
 * @param {number} homeOdds  锐利盘主队赔率
 * @param {number} awayOdds  锐利盘客队赔率
 * @param {"multiplicative"|"additive"} [method]
 * @returns {{ fairHome: number, fairAway: number, trueHomeProb: number, trueAwayProb: number, overround: number } | null}
 */
export function removVig(homeOdds, awayOdds, method = "multiplicative") {
  if (!homeOdds || !awayOdds || homeOdds <= 1 || awayOdds <= 1) return null;

  const impliedHome = 1 / homeOdds;
  const impliedAway = 1 / awayOdds;
  const overround = impliedHome + impliedAway;

  if (overround <= 1) return null;

  let trueHomeProb, trueAwayProb;

  if (method === "additive") {
    const vigPerSide = (overround - 1) / 2;
    trueHomeProb = impliedHome - vigPerSide;
    trueAwayProb = impliedAway - vigPerSide;
    if (trueHomeProb <= 0 || trueAwayProb <= 0) return null;
  } else {
    trueHomeProb = impliedHome / overround;
    trueAwayProb = impliedAway / overround;
  }

  return {
    fairHome: 1 / trueHomeProb,
    fairAway: 1 / trueAwayProb,
    trueHomeProb,
    trueAwayProb,
    overround,
  };
}
