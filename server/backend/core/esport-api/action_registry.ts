/**
 * esport action 路由注册表（阶段 2 低风险）。
 *
 * - 分类规则与 router legacy 分发一致（login / admin / pm_pf / account / core）
 * - ESPORT_ACTION_COMPARE=1：只比对 bucket/handlerId，永不双跑 handler
 * - ESPORT_ACTION_DISPATCH=legacy|registry：默认 legacy
 */
import { ESPORT_ACTIONS, type EsportAction } from "@changmen/api-contract/actions";
import { isAccountClientAction } from "./account_client_routes.js";
import { isAdminAction } from "./admin_routes.js";
import { isPmPfAction } from "./pm_pf_routes.js";

export type ActionBucket = "login" | "admin" | "pm_pf" | "account" | "core";

export interface ActionRoute {
  action: string;
  bucket: ActionBucket;
  handlerId: string;
}

/** 与 live is* 规则一致的分类（legacy 与 registry 共用，避免两套真相）。 */
export function classifyAction(action: string): ActionRoute {
  const a = String(action || "");
  if (a === "Client_Login") {
    return { action: a, bucket: "login", handlerId: "handleClientLogin" };
  }
  if (isAdminAction(a)) {
    return { action: a, bucket: "admin", handlerId: "handleAdminAction" };
  }
  if (isPmPfAction(a)) {
    return { action: a, bucket: "pm_pf", handlerId: "handlePmPfAction" };
  }
  if (isAccountClientAction(a)) {
    return { action: a, bucket: "account", handlerId: "handleAccountClientAction" };
  }
  return { action: a, bucket: "core", handlerId: a || "handleCoreAction" };
}

/** legacy if 链实际会走进的 bucket（与 classify 一致；login 不进 handle）。 */
export function legacyBucketFor(action: string): ActionBucket {
  return classifyAction(action).bucket;
}

const ROUTES: Map<string, ActionRoute> = new Map(
  ESPORT_ACTIONS.map((action) => {
    const route = classifyAction(action);
    return [action, route] as const;
  }),
);

export function getActionRoute(action: string): ActionRoute | null {
  const a = String(action || "");
  if (!a)
    return null;
  return ROUTES.get(a) ?? null;
}

export function listRegisteredActions(): string[] {
  return [...ROUTES.keys()];
}

export function assertRegistryCoversContract(): string[] {
  const missing: string[] = [];
  for (const action of ESPORT_ACTIONS) {
    if (!ROUTES.has(action))
      missing.push(action);
  }
  return missing;
}

export function isActionCompareEnabled(): boolean {
  return String(process.env.ESPORT_ACTION_COMPARE || "").trim() === "1";
}

export type ActionDispatchMode = "legacy" | "registry";

export function getActionDispatchMode(): ActionDispatchMode {
  const raw = String(process.env.ESPORT_ACTION_DISPATCH || "legacy").trim().toLowerCase();
  return raw === "registry" ? "registry" : "legacy";
}

/**
 * 只比对路由键；不一致打 warn，不改业务结果。
 * @returns true 表示一致或未启用
 */
export function compareActionRoute(
  action: string,
  legacyBucket: ActionBucket,
): boolean {
  if (!isActionCompareEnabled())
    return true;
  const route = getActionRoute(action);
  const expected = route?.bucket ?? null;
  const live = legacyBucketFor(action);
  if (expected != null && expected !== legacyBucket) {
    console.warn(
      `[esport-action] COMPARE mismatch action=${action} legacyBucket=${legacyBucket} registryBucket=${expected}`,
    );
    return false;
  }
  if (live !== legacyBucket) {
    console.warn(
      `[esport-action] COMPARE live/classify drift action=${action} recorded=${legacyBucket} live=${live}`,
    );
    return false;
  }
  if (route == null && (ESPORT_ACTIONS as readonly string[]).includes(action)) {
    console.warn(`[esport-action] COMPARE missing registry entry action=${action}`);
    return false;
  }
  return true;
}

export type { EsportAction };
