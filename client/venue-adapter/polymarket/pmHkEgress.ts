import { useUserStore } from "@venue/shared/webBridge";

/** 扩展页「PM HK出口」：经 changmen VPS relay/ws-forward 访问 Polymarket */
export function isPolymarketHkEgressEnabled(): boolean {
  try {
    return useUserStore().extensionPrefs?.pmHkEgress === true;
  }
  catch {
    return false;
  }
}
