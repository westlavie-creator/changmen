export interface PolymarketOrderResponseLike {
  success?: boolean;
  status?: string;
  orderID?: string;
  takingAmount?: string | number;
}

export interface PolymarketOrderRow {
  id?: string;
  status?: string;
  size_matched?: string | number;
  original_size?: string | number;
  associate_trades?: string[];
  order_type?: string;
}

export type PolymarketPollOutcome = "matched" | "unfilled" | "timeout";
