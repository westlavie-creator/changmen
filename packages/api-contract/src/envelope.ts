/** 对齐 server/backend/core/esport-api/router 与 client/web api/client 通用响应 */
export interface ApiSuccess<T = unknown> {
  success: 1;
  msg?: string;
  info?: T | null;
}

export interface ApiFailure {
  success: 0;
  msg?: string;
  info?: null;
}

export type ApiEnvelope<T = unknown> = ApiSuccess<T> | ApiFailure;
