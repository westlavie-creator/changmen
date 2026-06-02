'use strict';

const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs   = require('fs');
const { RayRelayCore } = require('../relays/ray_relay_core.js');
const { ObRelayCore } = require('../relays/ob_relay_core.js');

const PORT = Number(process.env.PORT || 3456);

// ── 递归复制目录（首次迁移用）──────────────────────────────────────────────
function copyDirSync(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}

// ── 打包后解析数据目录（优先级：便携 > userData > 自动迁移）────────────────
if (app.isPackaged) {
  const userData      = app.getPath('userData');
  const exeDir        = path.dirname(process.execPath);
  const resourcesPath = process.resourcesPath;

  // 静态前端固定从 extraResources 读取
  process.env.GAMEBET_APP_DIR     = path.join(resourcesPath, 'frontend', 'app', 'dist');
  process.env.GAMEBET_CONSOLE_DIR = path.join(resourcesPath, 'frontend', 'console');

  // 1. 便携模式：exe 同级目录有 gamebetdb/
  const portableDb = path.join(exeDir, 'gamebetdb', 'gamebet.db');
  if (fs.existsSync(portableDb)) {
    process.env.GAMEBET_DB_DIR     = path.join(exeDir, 'gamebetdb');
    process.env.GAMEBET_STORAGE_DIR = path.join(exeDir, 'storage');
    process.env.ESPORT_DATA_DIR     = path.join(exeDir, 'storage', 'legacy', 'esport');

  // 2. userData 已有数据，直接使用
  } else if (fs.existsSync(path.join(userData, 'gamebet.db'))) {
    process.env.GAMEBET_DB_PATH     = path.join(userData, 'gamebet.db');
    process.env.GAMEBET_STORAGE_DIR = path.join(userData, 'storage');
    process.env.ESPORT_DATA_DIR     = path.join(userData, 'storage', 'legacy', 'esport');

  // 3. 首次安装：沿 exe 向上逐级寻找开发目录的 gamebetdb，找到则迁移
  } else {
    let migrated = false;
    let dir = exeDir;
    for (let i = 0; i < 8; i++) {
      const candidateDb      = path.join(dir, 'gamebetdb', 'gamebet.db');
      const candidateStorage = path.join(dir, 'gamebet_backend', 'storage');
      if (fs.existsSync(candidateDb)) {
        const destDb = path.join(userData, 'gamebet.db');
        fs.mkdirSync(path.dirname(destDb), { recursive: true });
        fs.copyFileSync(candidateDb, destDb);
        if (fs.existsSync(candidateStorage)) {
          copyDirSync(candidateStorage, path.join(userData, 'storage'));
        }
        migrated = true;
        break;
      }
      dir = path.dirname(dir);
    }
    process.env.GAMEBET_DB_PATH     = path.join(userData, 'gamebet.db');
    process.env.GAMEBET_STORAGE_DIR = path.join(userData, 'storage');
    process.env.ESPORT_DATA_DIR     = path.join(userData, 'storage', 'legacy', 'esport');
    if (migrated) console.log('[electron] 已从开发目录迁移数据到', userData);
  }
}

// ── 启动 server.js ──────────────────────────────────────────────────────────
// dev 模式：fork 子进程（系统 Node.js），无需 electron-rebuild
// 打包模式：主进程直接 require（electron-builder 已重编译原生模块）
let _serverChild = null;
let _rayCore = null;
let _obCore = null;

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function ensureRayCore() {
  if (_rayCore) return _rayCore;
  _rayCore = new RayRelayCore({}, { syncRayFromSession: () => false });
  _rayCore.onMessage((payload) => {
    broadcast('gamebet:relay:ray:message', payload);
  });
  return _rayCore;
}

function ensureObCore() {
  if (_obCore) return _obCore;
  _obCore = new ObRelayCore({}, { syncObFromSession: () => false });
  _obCore.onMessage((topic, payload) => {
    broadcast('gamebet:relay:ob:message', {
      topic,
      payload: Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload ?? ''),
    });
  });
  return _obCore;
}

function registerRelayIpc() {
  ipcMain.handle('gamebet:relay:ray:start', async () => {
    const core = ensureRayCore();
    const status = core.getStatus();
    if (status.upstreamConnected) return status;
    await core.start();
    return core.getStatus();
  });
  ipcMain.handle('gamebet:relay:ray:stop', async () => {
    if (!_rayCore) return { platform: 'RAY', upstreamConnected: false };
    await _rayCore.stop();
    const status = _rayCore.getStatus();
    _rayCore = null;
    return status;
  });
  ipcMain.handle('gamebet:relay:ray:status', () => {
    return _rayCore ? _rayCore.getStatus() : { platform: 'RAY', upstreamConnected: false };
  });

  ipcMain.handle('gamebet:relay:ob:start', () => {
    const core = ensureObCore();
    core.start();
    return core.getStatus();
  });
  ipcMain.handle('gamebet:relay:ob:stop', () => {
    if (!_obCore) return { platform: 'OB', upstreamConnected: false };
    _obCore.stop();
    const status = _obCore.getStatus();
    _obCore = null;
    return status;
  });
  ipcMain.handle('gamebet:relay:ob:status', () => {
    return _obCore ? _obCore.getStatus() : { platform: 'OB', upstreamConnected: false };
  });
  ipcMain.handle('gamebet:relay:ob:subscribe', (_event, topic) => {
    ensureObCore().subscribeTopic(String(topic));
    return _obCore.getStatus();
  });
  ipcMain.handle('gamebet:relay:ob:unsubscribe', (_event, topic) => {
    if (_obCore) _obCore.unsubscribeTopic(String(topic));
    return _obCore ? _obCore.getStatus() : { platform: 'OB', upstreamConnected: false };
  });
  ipcMain.handle('gamebet:relay:ob:publish', (_event, topic, payload) => {
    return ensureObCore().publish(String(topic), Buffer.from(String(payload ?? ''), 'utf8'));
  });
}

if (!app.isPackaged) {
  const { fork } = require('child_process');
  _serverChild = fork(path.join(__dirname, '..', 'server.js'), [], {
    env: { ...process.env },
    stdio: 'inherit',
  });
  _serverChild.on('exit', (code) => {
    if (code !== 0) console.error(`[electron] server exited with code ${code}`);
  });
} else {
  require('../server.js');
};

// ── 等待 HTTP 服务就绪 ──────────────────────────────────────────────────────
function waitForServer(retries = 40) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/app/`, () => {
        req.destroy();
        resolve();
      });
      req.on('error', () => {
        if (--retries > 0) {
          setTimeout(attempt, 300);
        } else {
          reject(new Error(`服务未能在 12 秒内启动（port ${PORT}）`));
        }
      });
      req.end();
    };
    attempt();
  });
}

// ── 创建主窗口 ──────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'GameBet',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 去掉默认菜单栏
  Menu.setApplicationMenu(null);

  win.loadURL(`http://127.0.0.1:${PORT}/app/`);

  win.once('ready-to-show', () => win.show());

  // 键盘快捷键（菜单被隐藏后需手动注册）
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    if (input.key === 'F5' || (ctrl && input.key === 'r')) {
      win.webContents.reload();
      event.preventDefault();
    }
    if (input.key === 'F12' || (ctrl && input.shift && input.key === 'I')) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 所有外部链接在系统默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  return win;
}

// ── 生命周期 ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  registerRelayIpc();
  try {
    await waitForServer();
  } catch (err) {
    console.error('[electron]', err.message);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', async () => {
  if (_rayCore) await _rayCore.stop();
  if (_obCore) _obCore.stop();
  if (_serverChild) _serverChild.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
