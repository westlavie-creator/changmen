import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import { betPlatformIds, platformSupportsBet } from "@/platforms/registry";
import { obPlugin } from "@/platforms/ob";
import { pbPlugin } from "@/platforms/pb";
import { rayPlugin } from "@/platforms/ray";
import { tfPlugin } from "@/platforms/tf";
import { iaPlugin } from "@/platforms/ia";
import { imPlugin } from "@/platforms/im";
import { imtPlugin } from "@/platforms/imt";
import { sabaPlugin } from "@/platforms/saba";
import { stakePlugin } from "@/platforms/stake";
import { hgPlugin } from "@/platforms/hg";
import type { PlatformProvider } from "@/platforms/types";

const providers: Partial<Record<PlatformId, PlatformProvider>> = {
  OB: obPlugin.provider,
  RAY: rayPlugin.provider,
  PB: pbPlugin.provider,
  TF: tfPlugin.provider,
  IA: iaPlugin.provider,
  IM: imPlugin.provider,
  IMT: imtPlugin.provider,
  SABA: sabaPlugin.provider,
  Stake: stakePlugin.provider,
  HG: hgPlugin.provider,
};

export function getProvider(account: PlatformAccount): PlatformProvider | undefined {
  if (!account.provider || !platformSupportsBet(account.provider)) return undefined;
  return providers[account.provider];
}

export function supportedBetProviders(): PlatformId[] {
  return betPlatformIds();
}
