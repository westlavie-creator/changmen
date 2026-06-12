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

export interface AdminAccountBrief {
  accountId?: number;
  platform?: string;
  playerName?: string;
  balance?: number;
}

export interface AdminUserRow {
  id: string;
  userName: string;
  accountCount: number;
  accounts: AdminAccountBrief[];
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
