/** 本系统 /esport API — 统一出口（实现按域分布在 api/*.ts） */

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

export { getToken, setToken } from "@/api/client";

export { login, logout, getUserInfo, getUserDetail } from "@/api/auth";

export { getCollectPlatform, getGames, updatePlatform } from "@/api/platform";

export {
  saveMatchSource,
  saveBetSource,
  saveLiveTimer,
  saveScore,
  getMatchs,
} from "@/api/match";

export {
  getClientData,
  getClientDataArray,
  saveClientData,
  updateUserSetting,
} from "@/api/kv";

export { ACCOUNT_KEY, getData, saveData, updateBalance as vtUpdateBalance } from "@/api/vt";

export { getOrderList, saveOrder, saveOrderBind } from "@/api/order";

export {
  getAccounts,
  saveAccounts,
  updateBalance,
  deletePlayer,
  saveMoneyLog,
  deleteMoneyLog,
  getMoneyLogs,
  getMoneyLog,
  createTagPlatform,
  getTagPlatforms,
} from "@/api/account";

export { monthReport, getUserProfit, getRankList, getDefaultOdds, getMatchDefaultOdds } from "@/api/report";

export {
  getPlayerOrder,
  getUsers,
  getChatHistory,
  saveUserLog,
  sendMessage,
} from "@/api/chat";

export { getHgFollowOrders } from "@/api/hg";
