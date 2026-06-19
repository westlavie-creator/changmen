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
  isAdmin?: boolean;
  isOnline?: number;
  lastActiveAt?: number;
  lastLoginIp?: string;
  lastLoginAt?: number;
  bettingEnabled?: number;
  bettingScheduled?: number;
  bettingAutoOpenTime?: number;
  betMoney?: number;
  frozen?: number;
  frozenAt?: number;
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
  linkId: number;
  provider: string;
  match: string;
  bet: string;
  item: string;
  odds: number;
  betMoney: number;
  money: number;
  status: string;
  createAt: number;
  matchId?: number;
  matchKey?: string;
  matchLabel?: string;
  /** 开赛时间 ms，来自 client_matches 或订单 raw */
  matchStartTime?: number;
}

export interface AdminOrderPage {
  date: string;
  list: AdminOrderRow[];
  total: number;
  pageIndex: number;
  pageSize: number;
}

export interface AdminOrderMatrix {
  date: string;
  list: AdminOrderRow[];
  total: number;
}

export interface AdminOrderLogEntry {
  id?: number;
  createAt: number;
  title: string;
  kind: "check" | "bet" | "reject" | "other" | string;
  provider?: string | null;
  orderId?: string | null;
  target?: "Home" | "Away" | string | null;
  accountLabel?: string | null;
  loseOrder?: boolean;
  summary: string;
}

export interface AdminOrderLogLogSegment {
  key: string;
  accountLabel: string | null;
  provider: string | null;
  isMakeUp: boolean;
  logs: AdminOrderLogEntry[];
}

export interface AdminOrderLogPlatform {
  provider: string | null;
  label: string;
  orders: AdminOrderLogOrder[];
  logs: AdminOrderLogEntry[];
}

export interface AdminOrderLogAttempt {
  key: string;
  order: AdminOrderLogOrder | null;
  logs: AdminOrderLogEntry[];
  logSegments?: AdminOrderLogLogSegment[];
}

export interface AdminOrderLogLegSection {
  key: string;
  legIndex: number;
  side: "Home" | "Away" | string;
  label: string;
  provider: string | null;
  attempts: AdminOrderLogAttempt[];
}

export interface AdminOrderLogOrderSection {
  key: string;
  label: string;
  order: AdminOrderLogOrder | null;
  logs: AdminOrderLogEntry[];
}

export interface AdminOrderLogOrder {
  orderId: string;
  link: number;
  provider: string;
  playerId: number | string;
  match: string;
  bet: string;
  item: string;
  odds: number;
  betMoney: number;
  money: number;
  status: string;
  createAt: number;
}

export interface AdminOrderLogLookup {
  user: { id: string; userName: string };
  anchor: { type: string; value: string | number };
  link: number;
  linkType: string;
  groupLabel: string;
  logWindow: { fromMs: number; toMs: number };
  orders: AdminOrderLogOrder[];
  logs: AdminOrderLogEntry[];
  platforms?: AdminOrderLogPlatform[];
  orderSections?: AdminOrderLogOrderSection[];
  legSections?: AdminOrderLogLegSection[];
}
