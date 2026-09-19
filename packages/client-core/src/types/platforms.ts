import type { PlatformId } from "@changmen/api-contract";

/**
 * LEGACY COPY of Venue Catalog order — NOT Source of Truth.
 *
 * PRIMARY SOURCE: `client/venue-adapter/registry/manifest.json`
 * Keep set+order identical to manifest `sort` order.
 * Do NOT import `@changmen/venue-adapter` (would cycle: venue-adapter → client-core).
 * CI: `npm run check:venue-catalog` (`scripts/check-venue-catalog-consistency.mjs`).
 *
 * Used for account provider sort (`PlatformAccount.sortByProvider`).
 */
export const ALL_PLATFORMS: PlatformId[] = [
  "OB",
  "IM",
  "RAY",
  "TF",
  "IA",
  "SABA",
  "XBet",
  "PB",
  "IMT",
  "HG",
  "Stake",
  "Dex",
  "Polymarket",
  "Limitless",
  "SXBet",
  "Azuro",
  "PredictFun",
];
