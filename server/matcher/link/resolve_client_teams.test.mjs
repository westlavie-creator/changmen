import assert from "node:assert/strict";
/**
 * 关联预览主客须与 reconcile 一致：锁定 gb / Title 优先于 OB 等平台原始槽位。
 */
import { it } from "vitest";
import { setTeamPlugin } from "@changmen/match-engine";
import { analyzeSideAlignment, teamsFromLockedGbOrTitle } from "./index.js";

const FOKUS = "FOKUS";
const MANDATORY = "Mandatory";
const GB_FOKUS = "100477";
const GB_MANDATORY = "100508";

setTeamPlugin({
  lookupCanonicalName: (gb) => ({
    [GB_FOKUS]: FOKUS,
    [GB_MANDATORY]: MANDATORY,
  })[String(gb)] || null,
  lookupGameForGbTeamId: (gb) => (gb === GB_FOKUS || gb === GB_MANDATORY ? "valorant" : null),
});

it("locked gb beats OB-reversed platform slots for link preview", () => {
  const teams = teamsFromLockedGbOrTitle({
    home_gb_team_id: GB_FOKUS,
    away_gb_team_id: GB_MANDATORY,
    title: `${FOKUS} vs ${MANDATORY}`,
  }, "valorant");

  assert.equal(teams?.home, FOKUS);
  assert.equal(teams?.away, MANDATORY);

  const iaAlign = analyzeSideAlignment(FOKUS, MANDATORY, teams.home, teams.away);
  assert.equal(iaAlign.mode, "aligned", "IA FOKUS/Mandatory should align with canonical, not OB Mandatory/FOKUS");
});

it("falls back to Title when gb lock missing", () => {
  const teams = teamsFromLockedGbOrTitle({
    title: `${FOKUS} vs ${MANDATORY}`,
  }, "valorant");

  assert.equal(teams?.home, FOKUS);
  assert.equal(teams?.away, MANDATORY);
});
