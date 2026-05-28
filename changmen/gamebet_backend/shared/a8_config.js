"use strict";

const fs = require("fs");
const path = require("path");
const {
  A8_USER,
  A8_PASSWORD,
  A8_FORWARD_SITE,
} = require("./a8_constants.js");

const CONFIG_FILE = path.join(__dirname, "..", "data", "esport", "a8_config.json");

function loadA8ConfigFile() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    if (!data?.userName || !data?.password) return null;
    return data;
  } catch {
    return null;
  }
}

function saveA8Config({ userName, password }) {
  if (!userName || !password) {
    throw new Error("userName 与 password 不能为空");
  }
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  const payload = {
    userName: String(userName).trim(),
    password: String(password),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

/** 默认走 A8；A8_AUTH=0 时退回本地 users.json */
function isA8AuthEnabled() {
  if (process.env.A8_AUTH === "0") return false;
  return true;
}

/** 写死账号优先（对齐 A8 RMe），文件 / 环境变量可覆盖 */
function resolveA8Credentials(body = {}) {
  const fileCfg = loadA8ConfigFile();
  if (fileCfg) {
    return { userName: fileCfg.userName, password: fileCfg.password };
  }
  if (process.env.A8_V4_USER && process.env.A8_V4_PASSWORD) {
    return {
      userName: process.env.A8_V4_USER,
      password: process.env.A8_V4_PASSWORD,
    };
  }
  return {
    userName: A8_USER,
    password: A8_PASSWORD,
  };
}

function getHardcodedCredentials() {
  return { userName: A8_USER, password: A8_PASSWORD };
}

module.exports = {
  CONFIG_FILE,
  A8_FORWARD_SITE,
  loadA8Config: loadA8ConfigFile,
  saveA8Config,
  isA8AuthEnabled,
  resolveA8Credentials,
  getHardcodedCredentials,
};
