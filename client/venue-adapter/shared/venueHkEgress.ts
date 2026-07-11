import { useUserStore } from "@venue/shared/webBridge";

/** 扩展页「HK 出海 relay」：经 changmen VPS http-relay / ws-forward 访问需出海场馆 */
export function isVenueHkEgressEnabled(): boolean {
  try {
    const prefs = useUserStore().extensionPrefs as { venueHkEgress?: boolean; pmHkEgress?: boolean } | undefined;
    if (!prefs)
      return false;
    return prefs.venueHkEgress === true || prefs.pmHkEgress === true;
  }
  catch {
    return false;
  }
}
