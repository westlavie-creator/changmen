/** [changmen 扩展] 侧栏「进行中套利」展示模型 */

export type ActiveBetRunPhase =
  | "preparing"
  | "checking"
  | "placing"
  | "settling"
  | "makeup"
  | "syncing";

export type ActiveBetLegStatus =
  | "pending"
  | "placing"
  | "submitted"
  | "pending_confirm"
  | "confirmed"
  | "rejected"
  | "failed"
  | "makeup"
  | "skipped";

export interface ActiveBetLeg {
  side: "A" | "B";
  platform: string;
  target: string;
  odds?: number;
  betMoney?: number;
  status: ActiveBetLegStatus;
  detail?: string;
}

export interface ActiveBetRunEvent {
  at: number;
  stage: string;
  detail: string;
}

export interface ActiveBetRun {
  betId: number;
  matchId: number;
  linkId?: number;
  matchTitle: string;
  betName: string;
  phase: ActiveBetRunPhase;
  overallLabel: string;
  legs: ActiveBetLeg[];
  events: ActiveBetRunEvent[];
  startedAt: number;
  updatedAt: number;
  /** settling 阶段拒单等待倒计时截止（ms） */
  countdownUntil?: number;
}
