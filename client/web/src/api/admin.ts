import { post, unwrap } from "@/api/client";
import type {
  AdminDashboard,
  AdminOrderMatrix,
  AdminOrderPage,
  AdminOrderRow,
  AdminUserRow,
} from "@/types/admin";

export async function getAdminDashboard(date?: string) {
  return unwrap(await post<AdminDashboard>("Client_AdminDashboard", date ? { date } : {}));
}

export async function getAdminUsers(date?: string) {
  return unwrap(await post<AdminUserRow[]>("Client_AdminUsers", date ? { date } : {}));
}

export async function getAdminOrders(body: Record<string, unknown> = {}) {
  return unwrap(await post<AdminOrderPage>("Client_AdminOrders", body));
}

/** 拉取当日全部订单（优先矩阵 API；旧后端无此 action 时分页兜底） */
export async function getAdminOrdersMatrix(body: Record<string, unknown> = {}) {
  try {
    return unwrap(await post<AdminOrderMatrix>("Client_AdminOrdersMatrix", body));
  } catch (e) {
    const msg = String((e as Error).message || "");
    if (!msg.includes("unknown action")) throw e;
    const all: AdminOrderRow[] = [];
    let pageIndex = 1;
    const pageSize = 200;
    let dateKey = "";
    for (;;) {
      const page = await getAdminOrders({ ...body, pageIndex, pageSize });
      dateKey = page.date;
      all.push(...page.list);
      if (all.length >= page.total || !page.list.length) break;
      pageIndex += 1;
      if (pageIndex > 50) break;
    }
    return { date: dateKey, list: all, total: all.length };
  }
}

export interface AdminUserMutationResult {
  id: string;
  userName: string;
  frozen?: number;
  isAdmin?: number;
}

export async function setAdminUserAdmin(userId: string, isAdmin: boolean) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminSetUserAdmin", { userId, isAdmin }),
  );
}

export async function createAdminUser(userName: string, password: string) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminCreateUser", { userName, password }),
  );
}

export async function resetAdminUserPassword(userId: string, password: string) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminResetPassword", { userId, password }),
  );
}

export async function renameAdminUser(userId: string, userName: string) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminRenameUser", { userId, userName }),
  );
}

export async function deleteAdminOrders(orderIds: number[]) {
  return unwrap(
    await post<{ deleted: number }>("Client_AdminDeleteOrders", { orderIds }),
  );
}
