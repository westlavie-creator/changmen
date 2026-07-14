/** 本系统 /esport API — 统一出口（实现按域分布在 api/*.ts） */

export {
  createTagPlatform,
  deleteMoneyLog,
  deletePlayer,
  getAccounts,
  getMoneyLog,
  getMoneyLogs,
  getTagPlatforms,
  saveAccounts,
  saveMoneyLog,
  updateBalance,
} from "@/api/account";
export { getUserDetail, getUserInfo, login, logout } from "@/api/auth";

export {
  getChatHistory,
  getPlayerOrder,
  getUsers,
  saveUserLog,
  sendMessage,
} from "@/api/chat";

export { getToken, setToken } from "@/api/client";

export { getHgFollowOrders } from "@/api/hg";

export {
  getClientData,
  getClientDataArray,
  isEsportSuccess,
  saveClientData,
  saveClientDataDetailed,
  updateUserSetting,
} from "@/api/kv";

export {
  getBaseballMatchs,
  getFootballMatchs,
  getMatchs,
  saveBetSource,
  saveLiveTimer,
  saveMatchSource,
  saveScore,
} from "@/api/match";

export { getOrderList, saveOrder, saveOrderBind } from "@/api/order";

export { getCollectPlatform, getGames, updatePlatform } from "@/api/platform";

export { getDefaultOdds, getMatchDefaultOdds, getRankList, getUserProfit, monthReport } from "@/api/report";

export { ACCOUNT_KEY, getData, saveData, updateBalance as vtUpdateBalance } from "@/api/vt";

export type { ApiEnvelope } from "@/types/esport";

export type {
  BetRowDto,
  ClientMatchDto,
  CollectPlatformInfo,
  LoginInfo,
  OrderRow,
  PageResult,
  PlatformId,
  UserInfo,
} from "@/types/esport";
