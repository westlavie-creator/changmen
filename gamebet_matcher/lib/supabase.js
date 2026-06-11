"use strict";

require("./env");
const { getServiceClient } = require("../../shared/db/supabase");

/** matcher UI / link API 使用的 Supabase 客户端（service_role 优先） */
function getMatcherSupabase() {
  return getServiceClient();
}

module.exports = { getMatcherSupabase, getServiceClient };
