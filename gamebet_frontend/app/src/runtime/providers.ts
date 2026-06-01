import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import { betPlatformIds, platformSupportsBet } from "@/platforms/registry";
import { obAdapter } from "@/platforms/ob";
import { pbAdapter } from "@/platforms/pb";
import { rayAdapter } from "@/platforms/ray";
import { tfAdapter } from "@/platforms/tf";
import { iaAdapter } from "@/platforms/ia";
import { imAdapter } from "@/platforms/im";
import { imtAdapter } from "@/platforms/imt";
import { sabaAdapter } from "@/platforms/saba";
import { stakeAdapter } from "@/platforms/stake";
import { hgAdapter } from "@/platforms/hg";
import type { PlatformProvider } from "@/platforms/contract";

const providers: Partial<Record<PlatformId, PlatformProvider>> = {
  OB: obAdapter.provider,
  RAY: rayAdapter.provider,
  PB: pbAdapter.provider,
  TF: tfAdapter.provider,
  IA: iaAdapter.provider,
  IM: imAdapter.provider,
  IMT: imtAdapter.provider,
  SABA: sabaAdapter.provider,
  Stake: stakeAdapter.provider,
  HG: hgAdapter.provider,
};

export function getProvider(account: PlatformAccount): PlatformProvider | undefined {
  if (!account.provider || !platformSupportsBet(account.provider)) return undefined;
  return providers[account.provider];
}

export function supportedBetProviders(): PlatformId[] {
  return betPlatformIds();
}
