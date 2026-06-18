export interface MonthReportRow {
  Date?: string | number;
  Profit?: number;
  OrderCount?: number;
  BetMoney?: number;
  Rate?: number;
  Hacked?: number;
  RealProfit?: number;
  Deposit?: number;
  Withdraw?: number;
  Wallet?: number;
}

export interface MonthReportPayload {
  month?: string;
  userId?: string;
  list?: MonthReportRow[];
  total?: MonthReportRow;
}
