import { getFootballMatchs } from "@/api/esport";
import { combineFootballListSources } from "@/runtime/footballClientList";
import { fetchObFootballAsClientMatchDtos } from "@/runtime/obSportFootballFetch";
import { readLocalSportObSession } from "@/runtime/obSportSessionLocal";
import { createSportListStore } from "@/stores/createSportListStore";

async function fetchObRows() {
  try {
    return await fetchObFootballAsClientMatchDtos();
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[football] OB client fetch skipped", msg);
    if (readLocalSportObSession()?.token)
      throw err;
    return [];
  }
}

async function fetchFootballCombined(userName: string) {
  return combineFootballListSources(
    getFootballMatchs(userName),
    fetchObRows(),
  );
}

/** 足球列表：独立于 matchStore；不参与电竞套利主循环 */
export const useFootballStore = createSportListStore({
  id: "football",
  fetchList: fetchFootballCombined,
});
