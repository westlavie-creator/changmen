import type { PlatformId } from "@changmen/api-contract";

/**
 * BOUNDARY PROJECTION of Catalog Venue IDs — NOT Source of Truth.
 *
 * Why this file exists: venue collect/bet chunks import `PLATFORMS.OB` etc. without
 * pulling `registry/manifest` (avoids platform chunk → registry/main cycles).
 *
 * PRIMARY SOURCE: `registry/manifest.json`
 * TYPE CONSTRAINT: `PlatformId` from `@changmen/api-contract`
 * CI: `npm run check:venue-catalog` asserts key set ≡ manifest ids.
 *
 * Do not add ids here without a Catalog row + PlatformId mirror.
 */
export const PLATFORMS = {
  OB: "OB",
  IM: "IM",
  RAY: "RAY",
  TF: "TF",
  IA: "IA",
  SABA: "SABA",
  XBet: "XBet",
  PB: "PB",
  IMT: "IMT",
  HG: "HG",
  Stake: "Stake",
  Dex: "Dex",
  Polymarket: "Polymarket",
  Limitless: "Limitless",
  SXBet: "SXBet",
  Azuro: "Azuro",
  PredictFun: "PredictFun",
} as const satisfies Record<string, PlatformId>;
