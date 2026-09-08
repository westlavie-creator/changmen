import { getFootballMatchs } from "@/api/esport";
import { mergeFootballClientLists } from "@/runtime/footballClientList";
import { fetchObFootballAsClientMatchDtos } from "@/runtime/obSportFootballFetch";
import { readLocalSportObSession } from "@/runtime/obSportSessionLocal";
import { createSportListStore } from "@/stores/createSportListStore";

async function fetchFootballCombined(userName: string) {
  const pmPf = await getFootballMatchs(userName);
  let ob: Awaited<ReturnType<typeof fetchObFootballAsClientMatchDtos>> = [];
  try {
    ob = await fetchObFootballAsClientMatchDtos();
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[football] OB client fetch skipped", msg);
    if (readLocalSportObSession()?.token)
      throw err;
  }
  return mergeFootballClientLists(pmPf, ob);
}

/** 足球列表：独立于 matchStore；不参与电竞套利主循环 */
export const useFootballStore = createSportListStore({
  id: "football",
  fetchList: fetchFootballCombined,
});
