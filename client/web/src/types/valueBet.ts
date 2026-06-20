export interface ValueSignalRow {
  id: number;
  match_id: number;
  match_title: string;
  game: string;
  start_time: number;
  bet_name: string;
  map: number;
  home_name: string;
  away_name: string;
  sharp_platform: string;
  sharp_home_odds: string;
  sharp_away_odds: string;
  overround: string;
  fair_odds: string;
  soft_platform: string;
  soft_side: string;
  soft_odds: string;
  edge: string;
  kelly_full: string;
  kelly_frac: string;
  true_prob: string;
  status: string;
  bet_placed: boolean;
  bet_amount: string | null;
  result: string | null;
  pnl: string | null;
  created_at: string;
  expired_at: string | null;
  resolved_at: string | null;
}

export interface ValueSignalStatRow {
  status: string;
  count: number;
  avg_edge: string;
  max_edge: string;
}

export interface ValuePlatformDistRow {
  soft_platform: string;
  count: number;
  avg_edge: string;
}

export interface EdgeEntry {
  edge: number;
  platform: string;
  side: string;
  softOdds: number;
  fairOdds: number;
  sharpHome: number;
  sharpAway: number;
  match: string;
  game: string;
  betName: string;
  map: number;
}

export interface PlatformCoverage {
  platform: string;
  count: number;
  pct: number;
}

export interface VbConfig {
  sharpPlatform: string;
  softPlatforms: string[];
  minEdge: number;
  kellyMultiplier: number;
  minOdds: number;
  maxOdds: number;
}

export interface VbDiagnostics {
  matchCount: number;
  totalBets: number;
  betsWithSharp: number;
  sharpPct: number;
  platformCoverage: PlatformCoverage[];
  edgeDist: Record<string, number>;
  topEdges: EdgeEntry[];
  config: VbConfig;
}

export interface ValueBetDashboard {
  available: boolean;
  dbAvailable: boolean;
  signals: ValueSignalRow[];
  stats: ValueSignalStatRow[];
  platformDist: ValuePlatformDistRow[];
  diagnostics: VbDiagnostics;
  queriedAt: number;
}
