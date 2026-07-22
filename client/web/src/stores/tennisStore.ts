import { getTennisMatchs } from "@/api/esport";
import { createSportListStore } from "@/stores/createSportListStore";

/** 网球列表：独立于 matchStore；不参与电竞套利主循环 */
export const useTennisStore = createSportListStore({
  id: "tennis",
  fetchList: getTennisMatchs,
});
