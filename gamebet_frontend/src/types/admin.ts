export interface AdminProfitRow {
  UserID: number;
  UserName: string;
  Money: number;
  Count?: number;
  BetMoney?: number;
  Date?: string;
}

export interface AdminDashboard {
  date: string;
  userCount: number;
  activeUsersToday: number;
  orderCount: number;
  totalMoney: number;
  totalBetMoney: number;
  topProfit: AdminProfitRow[];
}

export interface AdminAccountRateRow {
  minOdds: number;
  maxOdds: number;
  rate: number;
}

export interface AdminAccountGameRow {
  betCount: number;
  profit: number;
  odds: string[];
}

export interface AdminAccountDetail {
  accountId: number;
  platform: string;
  platformId: number;
  platformName: string;
  playerName: string;
  balance: number;
  credit: number;
  currency: string;
  winBalance: number;
  unsettle: number;
  proxyId: number;
  pause: boolean;
  markupOnly: boolean;
  noMarkup: boolean;
  active: boolean;
  minOdds: number;
  maxOdds: number;
  minDefault: number;
  maxDefault: number;
  profit: number;
  maxProfit: number;
  maxBetCount: number;
  maxOrder: number;
  todayOrder: number;
  today: number;
  orderCount: number;
  totalProfit: number;
  maxBalance: number;
  maxWinBalance: number;
  description: string;
  realName: string;
  mobile: string;
  multiply: number;
  workTimes: string[];
  rateConfig: AdminAccountRateRow[];
  game: Record<string, AdminAccountGameRow>;
  gatewayHost: string;
  hasCredentials: boolean;
  updateTime: number;
}

export type AdminUserSetting = Record<string, unknown>;

export interface AdminUserRow {
  id: string;
  userName: string;
  accountCount: number;
  accounts: AdminAccountDetail[];
  setting: AdminUserSetting;
  createdAt: number;
  updatedAt: number;
  todayMoney: number;
  todayCount: number;
  todayBetMoney: number;
}

export interface AdminOrderRow {
  id: number;
  userId: string;
  playerId: number;
  orderId: string;
  provider: string;
  match: string;
  bet: string;
  item: string;
  odds: number;
  betMoney: number;
  money: number;
  status: string;
  createAt: number;
}

export interface AdminOrderPage {
  date: string;
  list: AdminOrderRow[];
  total: number;
  pageIndex: number;
  pageSize: number;
}
