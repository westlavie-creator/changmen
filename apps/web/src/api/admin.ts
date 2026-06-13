import { post, unwrap } from "@/api/client";
import type {
  AdminDashboard,
  AdminOrderPage,
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

export interface AdminUserMutationResult {
  id: string;
  userName: string;
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
