export interface ProxyRow {
  proxyId: number;
  label: string;
  url: string;
}

export interface MessageConfig extends Record<string, unknown> {
  telegramId?: string;
  pushOrderId?: string;
  /** [changmen 扩展] 套利执行进度报告（与 A8 bettingMessage 并存） */
  notifyArbProgress?: boolean;
}

export interface WalletRow {
  name: string;
  address: string;
  key: string;
  trx?: number;
  usdt?: number;
}
