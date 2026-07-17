/** 对齐 A8 content bundle 平台枚举 */
export const PLATFORMS = Object.freeze({
  OB: "OB",
  RAY: "RAY",
  IA: "IA",
  IM: "IM",
  TF: "TF",
  SABA: "SABA",
  PB: "PB",
  IMT: "IMT",
  HGA: "HGA",
  HG: "HG",
  Stake: "Stake",
  Dex: "Dex",
  Polymarket: "Polymarket",
});

export const PLATFORM_LIST = Object.values(PLATFORMS).filter(
  (id) =>
    id !== PLATFORMS.HG
    && id !== PLATFORMS.HGA
    && id !== PLATFORMS.IM
    && id !== PLATFORMS.TF
    && id !== PLATFORMS.XBet,
);
