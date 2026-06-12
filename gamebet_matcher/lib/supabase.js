import "./env.js";
import * as sb from "../../shared/db/supabase.js";

/** matcher UI / link API 使用的 Supabase 客户端（service_role 优先） */
export function getMatcherSupabase() {
  return sb.getServiceClient();
}

export const getServiceClient = sb.getServiceClient;
