import { getBasketballMatchs } from "@/api/esport";
import { createSportListStore } from "@/stores/createSportListStore";

/** 篮球列表：独立于 matchStore；不参与电竞套利主循环 */
export const useBasketballStore = createSportListStore({
  id: "basketball",
  fetchList: getBasketballMatchs,
});
