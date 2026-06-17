/** 补单队列 Map 键：A8 仅用 betId；changmen 用 matchId+betId 避免跨场碰撞 */
export function loseOrderKey(matchId: number, betId: number): string {
  return `${matchId}:${betId}`;
}
