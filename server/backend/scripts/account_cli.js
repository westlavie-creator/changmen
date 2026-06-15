#!/usr/bin/env node

/**
 * ???? CLI??????????????ACCOUNT KV??????? *
 * ??:
 *   npm run account:cli -- login admin admin
 *   npm run account:tags
 *   npm run account:create -- --platform ????--player test01
 *   npm run account:list
 *   npm run account:cli -- parse-credential <base64>
 *   npm run account:import-platform -- <base64> --sync-store
 *   npm run account:set-a8 -- <user> <password>
 *   npm run account:refresh
 */

import * as accountStore from "../core/account/account_store.js";
import * as accountService from "../core/account/account_service.js";
import {
  parseClipboardCredential,
  encodeClipboardCredential,
} from "../core/account/clipboard_credential.js";
import { importPlatformCredential } from "../core/shared/import_platform_credential.js";
import { saveA8Config, CONFIG_FILE } from "../core/integrations/a8/config.js";
import { syncPbFromSession } from "../core/esport-api/platform_sync.js";
import { requirePlatform } from "../core/shared/adapter_paths.js";
import store from "../core/esport-api/store.js";

const { tryLoadSession } = requirePlatform("PB", "node", "session.js");

function usage() {
  console.log(`??:
  login <user> <pass>              ??????token
  tags                             ??????
  create --platform <?? --player <??   ?? player?Client_CreateTagPlatform??  list                             ?? ACCOUNT KV
  save-sample                      ????????? ACCOUNT
  parse-credential <base64>        ??????
  import-platform <base64> [--sync-store]  ?? platforms.json????data ????  set-a8 <user> <password>             ?? A8 ??????A?????????? SSO??  refresh-balance                  ???????????PB/HG ???? provider??`);
}

function login(userName, password) {
  store.ensureSeed();
  const user = store.getUserByName(userName);
  if (!user) throw new Error("??????);
  const hash = store.hashPassword(password, user.salt);
  if (hash !== user.passwordHash) throw new Error("????");
  const token = store.createSession(user.id);
  console.log(JSON.stringify({ token, userName: user.userName, ID: user.id }, null, 2));
  return token;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  await accountStore.ensureSeed();
  store.ensureSeed();

  if (!cmd || cmd === "help" || cmd === "-h") {
    usage();
    return;
  }

  switch (cmd) {
    case "login": {
      login(rest[0] || "admin", rest[1] || "admin");
      break;
    }
    case "tags": {
      console.log(JSON.stringify(await accountStore.listTagPlatforms(), null, 2));
      break;
    }
    case "create": {
      let platform = "";
      let player = "";
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--platform") platform = rest[++i];
        if (rest[i] === "--player") player = rest[++i];
      }
      const r = await accountService.handleCreateTagPlatform({ platform, playerName: player });
      console.log(JSON.stringify(r, null, 2));
      break;
    }
    case "list": {
      console.log(JSON.stringify(accountStore.getAccountsFromKv(), null, 2));
      break;
    }
    case "save-sample": {
      const created = await accountStore.createTagPlatform("????", "demo01");
      const sample = {
        accountId: created.playerId,
        platformId: created.platformId,
        platformName: created.platformName,
        playerName: created.playerName,
        provider: "PB",
        gateway: process.env.PB_GATEWAY || "",
        token: process.env.PB_TOKEN || "",
        referer: process.env.PB_REFERER || process.env.PB_GATEWAY || "",
        maxBalance: 0,
        maxBalanceOdds: 2,
        minOdds: 0,
        maxOdds: 0,
        rateConfig: [],
        profit: 0,
        game: {},
        multiply: 1,
      };
      store.setUserKv("ACCOUNT", JSON.stringify([sample]));
      console.log(JSON.stringify(sample, null, 2));
      break;
    }
    case "parse-credential": {
      const cred = parseClipboardCredential(rest[0] || "");
      console.log(JSON.stringify(cred, null, 2));
      console.log("\n????Base64:\n", encodeClipboardCredential(cred));
      break;
    }
    case "import-platform": {
      const base64 = rest.find((arg) => arg && !arg.startsWith("--")) || "";
      const syncStore = rest.includes("--sync-store");
      const result = importPlatformCredential(base64);
      console.log(
        JSON.stringify(
          {
            ok: true,
            provider: result.provider,
            file: result.file,
            gateway: result.entry.gateway,
            updatedAt: result.entry.updatedAt,
          },
          null,
          2,
        ),
      );
      if (syncStore && result.provider === "PB") {
        const session = tryLoadSession();
        if (session) {
          syncPbFromSession(session);
          console.log("\n????PB ????esport store?Client_GetCollectPlatform??);
        }
      }
      break;
    }
    case "set-a8": {
      const userName = rest[0];
      const password = rest[1];
      if (!userName || !password) {
        throw new Error("??: set-a8 <A8???? <A8??>");
      }
      const saved = saveA8Config({ userName, password });
      console.log(
        JSON.stringify(
          {
            ok: true,
            file: CONFIG_FILE,
            userName: saved.userName,
            updatedAt: saved.updatedAt,
          },
          null,
          2,
        ),
      );
      break;
    }
    case "refresh-balance": {
      const rows = await accountService.refreshAllAccountBalances();
      console.log(JSON.stringify(rows, null, 2));
      break;
    }
    default:
      usage();
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
