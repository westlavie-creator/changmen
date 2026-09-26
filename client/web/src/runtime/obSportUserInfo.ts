/** OB 体育官网会员资料。用于把 sportOb 凭证绑定到正确的电竞账号卡。 */
import { getObSportPb } from "@/runtime/obSportFootballFetch";
import {
  isObSportMemberId,
  type ObSportBetAccountLike,
} from "@/runtime/obSportBetAccount";
import { resolveObSportAmountSession } from "@/runtime/obSportAmount";

export const OB_SPORT_USER_INFO_PATH = "/yewu12/user/getUserInfoPB";

export type ObSportUserInfo = {
  venueMemberId: string;
  venueAccountName: string;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
}

export function parseObSportUserInfo(decoded: unknown): ObSportUserInfo {
  const root = asRecord(decoded);
  const data = asRecord(root.data);
  const row = Object.keys(data).length ? data : root;
  const venueMemberId = String(row.userId || row.uid || "").trim();
  const venueAccountName = String(row.userName || row.username || row.nickName || "").trim();
  if (!isObSportMemberId(venueMemberId))
    throw new Error("体育官网会员资料缺少有效 UID");
  if (!venueAccountName)
    throw new Error("体育官网会员资料缺少会员账号");
  return { venueMemberId, venueAccountName };
}

export async function fetchObSportUserInfoForAccount(
  account: ObSportBetAccountLike,
): Promise<ObSportUserInfo> {
  const session = resolveObSportAmountSession(account);
  if (!session?.token || !session.gateway)
    throw new Error("体育 OB 凭证不完整");
  const decoded = await getObSportPb(
    OB_SPORT_USER_INFO_PATH,
    { token: session.token },
    session,
  );
  return parseObSportUserInfo(decoded);
}

export function assertObSportAccountBinding(opts: {
  expectedVenueMemberId?: string;
  esportVenueAccountName?: string;
  hasEsportCredential?: boolean;
  sport: ObSportUserInfo;
}): void {
  const expectedId = String(opts.expectedVenueMemberId || "").trim();
  if (expectedId && expectedId !== opts.sport.venueMemberId) {
    throw new Error(
      `体育会员 UID 不一致：凭证填写 ${expectedId}，官网返回 ${opts.sport.venueMemberId}`,
    );
  }
  const esportName = String(opts.esportVenueAccountName || "").trim();
  if (opts.hasEsportCredential && !esportName)
    throw new Error("电竞会员账号缺失，请先刷新并保存电竞凭证");
  if (
    opts.hasEsportCredential
    && esportName.toLowerCase() !== opts.sport.venueAccountName.toLowerCase()
  ) {
    throw new Error(
      `体育会员账号 ${opts.sport.venueAccountName} 与电竞会员账号 ${esportName} 不一致`,
    );
  }
}
