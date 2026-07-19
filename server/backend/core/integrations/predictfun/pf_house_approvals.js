/**
 * House 主号协议授权（ERC-20 USDT + ERC-1155）
 * @see https://dev.predict.fun/how-to-create-or-cancel-orders-679306m0#how-to-set-approvals
 *
 * 进程内成功一次即跳过；失败则下次下单再试。
 * 测试 / 无 gas：`PF_HOUSE_SKIP_APPROVALS=1`
 */

/** @type {Promise<boolean>|null} */
let approvalsInFlight = null;
let approvalsDone = false;

export function isPfHouseApprovalsSkipped() {
  const v = String(process.env.PF_HOUSE_SKIP_APPROVALS ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** @internal 单测 */
export function _resetHouseApprovalsStateForTests() {
  approvalsInFlight = null;
  approvalsDone = false;
}

/**
 * @param {{ setApprovals: () => Promise<{ success?: boolean, cause?: unknown }> }} orderBuilder
 * @returns {Promise<boolean>} true=已授权（或跳过）
 */
export async function ensureHouseApprovals(orderBuilder) {
  if (isPfHouseApprovalsSkipped())
    return true;
  if (approvalsDone)
    return true;
  if (approvalsInFlight)
    return approvalsInFlight;

  approvalsInFlight = (async () => {
    if (!orderBuilder || typeof orderBuilder.setApprovals !== "function")
      throw new Error("OrderBuilder.setApprovals 不可用");
    const result = await orderBuilder.setApprovals();
    if (!result?.success) {
      const cause = result?.cause != null ? String(result.cause) : "unknown";
      throw new Error(`Predict.fun setApprovals 失败：${cause}`);
    }
    approvalsDone = true;
    console.info("[Pf_Approvals] house setApprovals ok");
    return true;
  })();

  try {
    return await approvalsInFlight;
  }
  catch (err) {
    approvalsInFlight = null;
    throw err;
  }
}
