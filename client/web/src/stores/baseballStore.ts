import { getBaseballMatchs } from "@/api/esport";
import { createSportListStore } from "@/stores/createSportListStore";

/** 棒球列表：独立于 matchStore；不参与电竞套利主循环 */
export const useBaseballStore = createSportListStore({
  id: "baseball",
  fetchList: getBaseballMatchs,
});
