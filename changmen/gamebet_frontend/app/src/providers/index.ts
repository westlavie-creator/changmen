import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import { betPlatformIds, platformSupportsBet } from "@/platforms/registry";
import { obProvider } from "@/providers/obProvider";
import { pbProvider } from "@/providers/pbProvider";
import { rayProvider } from "@/providers/rayProvider";
import { tfProvider } from "@/providers/tfProvider";
import { iaProvider } from "@/providers/iaProvider";
import { imProvider } from "@/providers/imProvider";
import { imtProvider } from "@/providers/imtProvider";
import { sabaProvider } from "@/providers/sabaProvider";
import { stakeProvider } from "@/providers/stakeProvider";
import { hgProvider } from "@/providers/hgProvider";
import type { PlatformProvider } from "@/providers/types";

const providers: Partial<Record<PlatformId, PlatformProvider>> = {
  OB: obProvider,
  RAY: rayProvider,
  PB: pbProvider,
  TF: tfProvider,
  IA: iaProvider,
  IM: imProvider,
  IMT: imtProvider,
  SABA: sabaProvider,
  Stake: stakeProvider,
  HG: hgProvider,
};

export function getProvider(account: PlatformAccount): PlatformProvider | undefined {
  if (!account.provider || !platformSupportsBet(account.provider)) return undefined;
  return providers[account.provider];
}

export function supportedBetProviders(): PlatformId[] {
  return betPlatformIds();
}
