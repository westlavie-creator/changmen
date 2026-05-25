import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import { obProvider } from "@/providers/obProvider";
import { pbProvider } from "@/providers/pbProvider";
import { rayProvider } from "@/providers/rayProvider";
import { tfProvider } from "@/providers/tfProvider";
import { iaProvider } from "@/providers/iaProvider";
import { imProvider } from "@/providers/imProvider";
import { imtProvider } from "@/providers/imtProvider";
import { sabaProvider } from "@/providers/sabaProvider";
import { stakeProvider } from "@/providers/stakeProvider";
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
};

export function getProvider(account: PlatformAccount): PlatformProvider | undefined {
  return account.provider ? providers[account.provider] : undefined;
}

export function supportedBetProviders(): PlatformId[] {
  return Object.keys(providers) as PlatformId[];
}
