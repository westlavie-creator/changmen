/**
 * PredictFun 会员中转（house / 充值 / Changmencodefee 管理）已下线。
 * 保留同名 export，避免 router / admin_service import 断裂；调用一律拒绝。
 */
import { isAdminUser } from "../auth/admin_auth.js";

export const PF_MEMBERSHIP_REMOVED_MSG
  = "PredictFun 会员中转已下线：不再开通 house 账号、充值或 Changmencodefee。请等待自有账号下注接入。";

function assertAdmin(caller) {
  if (caller && !isAdminUser(caller))
    throw new Error("无管理员权限");
}

function removed(_caller = null) {
  assertAdmin(_caller);
  throw new Error(PF_MEMBERSHIP_REMOVED_MSG);
}

/** @deprecated 会员列表已下线 */
export async function listAdminPredictFunMembers(caller = null) {
  return removed(caller);
}

/** @deprecated Changmencodefee 配置已下线 */
export async function getAdminPredictFunFeeConfig(caller = null) {
  return removed(caller);
}

/** @deprecated Changmencodefee 配置已下线 */
export async function saveAdminPredictFunFeeConfig(_body = {}, caller = null) {
  return removed(caller);
}

/** @deprecated house 开户已下线 */
export async function ensurePredictFunHouseAccount(_userId, caller = null) {
  return removed(caller);
}

/** @deprecated 会员充值已下线 */
export async function rechargeAdminPredictFunMember(_userId, _accountId, _body = {}, caller = null) {
  return removed(caller);
}

/** @deprecated 会员流水查询随会员页下线 */
export async function listAdminPredictFunMoneyLogs(_userId, _accountId, _body = {}, caller = null) {
  return removed(caller);
}

/** @deprecated 会员订单查询随会员页下线 */
export async function listAdminPredictFunMemberOrders(_userId, _accountId, caller = null) {
  return removed(caller);
}
