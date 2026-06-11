'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Electron 安装版 .env 候选路径（按优先级）。
 * 开发模式返回 []，由 gamebet_backend/.env + dotenv.config() 处理。
 */
function packagedEnvCandidates(options = {}) {
  if (!options.isPackaged) return [];

  const paths = [];
  const exeDir = path.dirname(options.execPath || process.execPath);

  paths.push(path.join(exeDir, '.env'));

  if (options.userDataDir) {
    paths.push(path.join(options.userDataDir, '.env'));
  }

  const appData = process.env.APPDATA || process.env.HOME || '';
  if (appData) {
    paths.push(path.join(appData, 'gamebet-backend', '.env'));
    paths.push(path.join(appData, 'GameBet', '.env'));
  }

  if (options.resourcesPath) {
    paths.push(path.join(options.resourcesPath, 'config', 'supabase.env'));
  }

  const seen = new Set();
  return paths.filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
}

/** 加载第一个存在且含 Supabase 配置的 .env；返回路径或 null */
function loadPackagedEnv(options = {}) {
  const dotenv = require('dotenv');
  for (const envPath of packagedEnvCandidates(options)) {
    if (!fs.existsSync(envPath)) continue;
    dotenv.config({ path: envPath, override: true });
    if (hasSupabaseEnv()) return envPath;
  }
  return null;
}

function hasSupabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;
  return Boolean(url && key);
}

/** 诊断：各候选路径是否存在（不读密钥内容） */
function describeEnvStatus(options = {}) {
  const paths = packagedEnvCandidates(options);
  const lines = paths.map((p) => `${fs.existsSync(p) ? '✓' : '✗'} ${p}`);
  return {
    paths,
    lines,
    loaded: hasSupabaseEnv(),
  };
}

module.exports = {
  packagedEnvCandidates,
  loadPackagedEnv,
  hasSupabaseEnv,
  describeEnvStatus,
};
