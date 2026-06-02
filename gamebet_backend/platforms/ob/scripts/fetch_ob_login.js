#!/usr/bin/env node
/**
 * Step 1: OB login — get token, gateway, MQTT endpoints.
 *
 * Usage:
 *   node platforms/ob/scripts/fetch_ob_login.js
 *   node platforms/ob/scripts/fetch_ob_login.js "<login url>"
 *
 * Default login URL: see platforms/ob/README.md (override with OB_LOGIN_URL).
 */

const { DEFAULT_LOGIN_URL, login } = require("../ob_session.js");

async function main() {
  const loginUrl = process.argv[2] || DEFAULT_LOGIN_URL;
  const session = await login(loginUrl);
  console.log(JSON.stringify(session, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: err.message, loginUrl: err.loginUrl, response: err.response }, null, 2));
  process.exit(1);
});
