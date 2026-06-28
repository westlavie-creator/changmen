import type { PlatformId } from "@/types/esport";
import { PlatformAccount } from "@/models/platformAccount";
import { getProvider } from "@/runtime/providers";

export interface GatewayProbeResult {
  gate: string;
  time: number;
  success: boolean;
}

/** [A8 可证实] AccountInfoView：gateway.length>1 时对各 gateway 调 GetProvider().getBalance() 测速 */
export async function pickFastestGateway(
  accountFactory: (gateway: string) => PlatformAccount,
  gateways: string[],
  onProbe?: (result: GatewayProbeResult) => void,
): Promise<string> {
  const ranked: GatewayProbeResult[] = [];
  for (const gate of gateways) {
    const probe = accountFactory(gate);
    const platformProvider = getProvider(probe);
    const probeBalance = platformProvider?.getBalance?.bind(platformProvider);
    const started = Date.now();
    let success = false;
    try {
      success = probeBalance ? Boolean(await probeBalance(probe)) : false;
    }
    catch {
      success = false;
    }
    const result = { gate, time: Date.now() - started, success };
    ranked.push(result);
    onProbe?.(result);
  }
  const fast = ranked.filter(r => r.success && r.time < 500);
  const best
    = fast.length > 0
      ? fast[Math.floor(Math.random() * fast.length)]!
      : ranked.filter(r => r.success).sort((a, b) => a.time - b.time)[0];
  return best?.gate ?? "";
}

export function createGatewayProbeAccount(input: {
  provider: PlatformId;
  gateway: string;
  token: string;
  referer: string;
  proxyId?: number;
}): PlatformAccount {
  return new PlatformAccount({
    accountId: 0,
    provider: input.provider,
    playerName: "",
    gateway: input.gateway,
    token: input.token,
    referer: input.referer,
    proxyId: input.proxyId,
    currency: "CNY",
    updateTime: Date.now(),
  });
}
