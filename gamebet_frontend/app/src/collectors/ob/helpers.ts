import { saveLiveTimer, updatePlatform } from "@/api/esport";
import { OB_DEMO_LOGIN_URL } from "@/api/v4";
import { collectObGet } from "@/collectors/ob/http";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";
import { directGet } from "@/shared/http";
import { num } from "@/collectors/ob/parse";

const TEAM_LOGO_URL = "https://uphw-cdn3.jomscxu.com/upload/json/pc.json";
const TEAM_LOGO_LS = "OBService:TeamLogo";

let teamLogos: Record<string, string> | null = null;

/** 对齐 A8 v0：移动端 device=2，PC=1 */
export function obDeviceId(userAgent?: string): string {
  return userAgent && /mobile/i.test(userAgent) ? "2" : "1";
}

async function loadObTeamLogosMap(): Promise<Record<string, string> | null> {
  try {
    const data = await directGet<{ team_imag?: Record<string, string> }>(TEAM_LOGO_URL, {});
    return data.team_imag ?? null;
  } catch {
    return null;
  }
}

/** 对齐 A8 e9：首轮采集前拉取队徽表（Nr.get 直连 CDN） */
export async function ensureObTeamLogosLoaded(): Promise<void> {
  if (teamLogos) return;
  teamLogos = await loadObTeamLogosMap();
  if (teamLogos) {
    localStorage.setItem(TEAM_LOGO_LS, JSON.stringify(teamLogos));
    return;
  }
  const cached = localStorage.getItem(TEAM_LOGO_LS);
  if (!cached) return;
  try {
    teamLogos = JSON.parse(cached) as Record<string, string>;
  } catch {
    teamLogos = null;
  }
}

/** 队徽 URL（需已 ensureObTeamLogosLoaded） */
export function resolveObTeamLogoSync(teamId: string): string {
  if (!teamLogos || !teamLogos[teamId]) return "";
  return `https://uphw-cdn6.peyesight.com/${teamLogos[teamId]}`;
}

/** 对齐 A8 e9：队徽 CDN */
export async function resolveObTeamLogo(teamId: string): Promise<string> {
  await ensureObTeamLogosLoaded();
  return resolveObTeamLogoSync(teamId);
}

/** 对齐 A8 $Me：采集 token 失效时试玩登录并写回平台配置 */
export async function refreshObCollectToken(): Promise<string | null> {
  try {
    const body = await directGet<{ data?: { pc?: string } }>(OB_DEMO_LOGIN_URL, {});
    const pc = body?.data?.pc;
    if (!pc) return null;
    const token = new URL(pc).searchParams.get("token");
    if (!token) return null;
    await updatePlatform({ provider: PLATFORMS.OB, token });
    return token;
  } catch {
    return null;
  }
}

/** 对齐 A8 MMe：拉取 live timer 并入库 */
export async function syncObLiveTimer(platform: CollectPlatformInfo): Promise<void> {
  const res = await collectObGet<{
    status: string;
    data?: Record<string, Record<string, unknown>>;
  }>(platform, "game/getTimer", "");
  if (res.status !== "true" || !res.data) return;
  const timers = Object.values(res.data).map((row) => ({
    MatchID: row.match_id,
    Round: num(row.round),
    StartTime: num(row.start_time) * 1000,
  }));
  await saveLiveTimer(PLATFORMS.OB, timers);
}
