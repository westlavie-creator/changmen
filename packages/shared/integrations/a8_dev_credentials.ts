/**
 * 本地开发 / 联调默认凭据（历史命名 A8_*，仅作本地登录回退，不再指向 A8 上游）。
 * 控制台 Client_Login：A8_USER + A8_PASSWORD。
 * 服务端 `integrations/a8/constants.js` 再导出，供 backend 沿用原路径。
 */
export const A8_USER = "TJ01";
/** RDS / 控制台 Client_Login */
export const A8_PASSWORD = "a123456";
/** 历史 v4 密码常量；v4 信用盘已停用 */
export const A8_V4_PASSWORD = "a123456";
/** @deprecated v4 / x-forwarded-site 已停用；勿再填 api.a8.to */
export const A8_FORWARD_SITE = "";
export const A8_GAME_ID_PB = 3;
