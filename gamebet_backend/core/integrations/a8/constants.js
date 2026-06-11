"use strict";

/**
 * 对齐 A8 bundle UserCollectView 常量：
 *   RMe = "a123456"   — v4 进入游戏密码
 *   FMe = "game.haijings.vip"
 *   WMe = 3           — 平博 gameId
 *
本地开发：控制台登录 + 平博 SSO 均使用此处写死的 A8 账号（生产用 Supabase 用户，勿依赖此默认值）。
 * 修改下面两行即可切换账号。
 */
module.exports = {
  A8_USER: "TJ01",
  A8_PASSWORD: "a123456",
  A8_FORWARD_SITE: "game.haijings.vip",
  A8_GAME_ID_PB: 3,
};
