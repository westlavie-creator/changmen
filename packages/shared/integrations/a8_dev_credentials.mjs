/**
 * 本地开发 / 联调默认 A8 凭据（对齐 A8 bundle UserCollectView）：
 *   RMe = "a123456"   — v4 进入游戏密码（A8_V4_PASSWORD）
 *   FMe = "game.haijings.vip"
 *   WMe = 3           — 平博 gameId
 *
 * 控制台 Client_Login：A8_USER + A8_PASSWORD；平博 v4：A8_V4_PASSWORD。
 * 服务端 `integrations/a8/constants.js` 再导出，供 backend 沿用原路径。
 */
export const A8_USER = "TJ01";
/** RDS / 控制台 Client_Login */
export const A8_PASSWORD = "185108";
/** v4 user/account/login（bundle RMe） */
export const A8_V4_PASSWORD = "a123456";
export const A8_FORWARD_SITE = "game.haijings.vip";
export const A8_GAME_ID_PB = 3;
