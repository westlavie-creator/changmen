export interface ProxyRow {
  proxyId: number;
  label: string;
  url: string;
}

export interface MessageConfig extends Record<string, unknown> {
  telegramId?: string;
  pushOrderId?: string;
}

export interface WalletRow {
  name: string;
  address: string;
  key: string;
  trx?: number;
  usdt?: number;
}
