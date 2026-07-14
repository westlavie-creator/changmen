import { getFootballMatchs } from "@/api/esport";
import { createSportListStore } from "@/stores/createSportListStore";

/** 足球列表：独立于 matchStore；不参与电竞套利主循环 */
export const useFootballStore = createSportListStore({
  id: "football",
  fetchList: getFootballMatchs,
});
