import { post, setToken, setRefreshToken, unwrap } from "@/api/client";
import type { LoginInfo, UserInfo } from "@/types/esport";

export async function login(userName: string, password: string) {
  const data = await post<LoginInfo>("Client_Login", { userName, password });
  const info = unwrap(data);
  if (!info?.token) throw new Error(data.msg || "登录失败");
  setToken(info.token);
  if (info.refreshToken) setRefreshToken(info.refreshToken);
  return info;
}

export async function logout() {
  try {
    await post<null>("Client_Logout");
  } finally {
    setToken(null);
    setRefreshToken(null);
  }
}

export async function getUserInfo() {
  return unwrap(await post<UserInfo>("Client_GetUserInfo"));
}

export async function getUserDetail() {
  return unwrap(await post<{ Id: number }>("Client_GetUserDetail"));
}
