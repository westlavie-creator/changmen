import type { CollectMatchDto } from "@/types/collect";
import { PLATFORMS } from "@/shared/platform";
import { ensureObTeamLogosLoaded, resolveObTeamLogoSync } from "@/collectors/ob/helpers";
import { num } from "@/collectors/ob/parse";

const PLATFORM = PLATFORMS.OB;

/** game/index 列表行的 match_team → 主客队名 */
export function teamsFromListRow(row: Record<string, unknown>): [string, string] {
  const teams = String(row.match_team ?? "")
    .replace(/&nbsp;/g, " ")
    .split(",");
  return [teams[0] ?? "", teams[1] ?? ""];
}

/** game/index 列表 → Client_SaveMatch 载荷 */
export async function buildMatchesFromList(
  rows: Array<Record<string, unknown>>,
): Promise<CollectMatchDto[]> {
  await ensureObTeamLogosLoaded();
  const payload: CollectMatchDto[] = [];
  for (const row of rows) {
    const [homeName, awayName] = teamsFromListRow(row);
    const teamIds = String(row.team_id ?? "").split(",");
    if (!homeName || !awayName || teamIds.length !== 2) continue;
    const homeLogo = resolveObTeamLogoSync(teamIds[0]!);
    const awayLogo = resolveObTeamLogoSync(teamIds[1]!);
    payload.push({
      Type: PLATFORM,
      SourceGameID: row.game_id as string | number,
      SourceMatchID: row.id as string | number,
      BO: num(row.bo),
      StartTime: num(row.start_time) * 1000,
      Home: homeName,
      HomeID: teamIds[0]!,
      Away: awayName,
      AwayID: teamIds[1]!,
      Teams: [
        {
          Type: PLATFORM,
          GameID: row.game_id as string | number,
          Name: homeName,
          TeamID: teamIds[0]!,
          Logo: homeLogo,
        },
        {
          Type: PLATFORM,
          GameID: row.game_id as string | number,
          Name: awayName,
          TeamID: teamIds[1]!,
          Logo: awayLogo,
        },
      ],
    });
  }
  return payload;
}
