'use strict';

const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs   = require('fs');
const { RayRelayCore } = require('../../relays/ray_relay_core.js');
const { ObRelayCore }  = require('../../relays/ob_relay_core.js');
const { TfRelayCore }  = require('../../relays/tf_relay_core.js');
const { IaRelayCore }  = require('../../relays/ia_relay_core.js');

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

// server.js 始终在主进程内 require（后端无原生模块，无需 electron-rebuild）
// 主进程与 server.js 共享同一 module cache / store，IPC handler 直接调用。

// ── 打包后解析数据目录（优先级：便携 > userData > 首次安装）──────────────────
if (app.isPackaged) {
  const userData      = app.getPath('userData');
  const exeDir        = path.dirname(process.execPath);
  const resourcesPath = process.resourcesPath;

  // 静态前端固定从 extraResources 读取
  process.env.GAMEBET_APP_DIR     = path.join(resourcesPath, 'frontend', 'app', 'dist');
  process.env.GAMEBET_CONSOLE_DIR = path.join(resourcesPath, 'frontend', 'console');

  // 1. 便携模式：exe 同级目录有 storage/
  if (fs.existsSync(path.join(exeDir, 'storage'))) {
    process.env.GAMEBET_STORAGE_DIR = path.join(exeDir, 'storage');
    process.env.ESPORT_DATA_DIR     = path.join(exeDir, 'storage', 'legacy', 'esport');

  // 2. userData 已有 storage，直接使用
  } else if (fs.existsSync(path.join(userData, 'storage'))) {
    process.env.GAMEBET_STORAGE_DIR = path.join(userData, 'storage');
    process.env.ESPORT_DATA_DIR     = path.join(userData, 'storage', 'legacy', 'esport');

  // 3. 首次安装：沿 exe 向上逐级寻找开发目录的 storage，找到则迁移
  } else {
    let dir = exeDir;
    for (let i = 0; i < 8; i++) {
      const candidateStorage = path.join(dir, 'gamebet_backend', 'storage');
      if (fs.existsSync(candidateStorage)) {
        copyDirSync(candidateStorage, path.join(userData, 'storage'));
        console.log('[electron] 已从开发目录迁移数据到', userData);
        break;
      }
      dir = path.dirname(dir);
    }
    process.env.GAMEBET_STORAGE_DIR = path.join(userData, 'storage');
    process.env.ESPORT_DATA_DIR     = path.join(userData, 'storage', 'legacy', 'esport');
  }
}

// ── 启动 server.js ──────────────────────────────────────────────────────────
let _rayCore = null;
let _obCore  = null;
let _tfCore  = null;
let _iaCore  = null;

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

function ensureTfCore() {
  if (_tfCore) return _tfCore;
  _tfCore = new TfRelayCore();
  _tfCore.onMessage((text) => {
    broadcast('gamebet:relay:tf:message', text);
  });
  return _tfCore;
}

function ensureIaCore() {
  if (_iaCore) return _iaCore;
  _iaCore = new IaRelayCore();
  _iaCore.onMessage((msg) => {
    broadcast('gamebet:relay:ia:message', msg);
  });
  return _iaCore;
}

function registerRelayIpc() {
  // IA Socket.IO relay
  ipcMain.handle('gamebet:relay:ia:start', () => {
    let gateway = '';
    try {
      const store = require('../../core/esport-api/store.js');
      gateway = store.getPlatform('IA')?.gateway || '';
    } catch { /* store 未初始化时忽略 */ }
    return ensureIaCore().start(gateway);
  });
  ipcMain.handle('gamebet:relay:ia:stop', () => {
    if (!_iaCore) return { platform: 'IA', upstreamConnected: false };
    const status = _iaCore.stop();
    _iaCore = null;
    return status;
  });
  ipcMain.handle('gamebet:relay:ia:status', () => {
    return _iaCore ? _iaCore.getStatus() : { platform: 'IA', upstreamConnected: false };
  });

  // TF WS relay
  ipcMain.handle('gamebet:relay:tf:start', (_event, token) => {
    // gateway 从 store 取（packaged 模式下与 server.js 共享 module cache）
    let gateway = '';
    try {
      const store = require('../../core/esport-api/store.js');
      gateway = store.getPlatform('TF')?.gateway || '';
    } catch { /* store 未初始化时忽略，relay 仍可尝试连接 */ }
    return ensureTfCore().start(token, gateway);
  });
  ipcMain.handle('gamebet:relay:tf:stop', () => {
    if (!_tfCore) return { platform: 'TF', upstreamConnected: false };
    const status = _tfCore.stop();
    _tfCore = null;
    return status;
  });
  ipcMain.handle('gamebet:relay:tf:status', () => {
    return _tfCore ? _tfCore.getStatus() : { platform: 'TF', upstreamConnected: false };
  });

  // esport API — 直调 router 核心逻辑，绕过 localhost HTTP
  ipcMain.handle('gamebetApi:esport', async (_event, action, body, token) => {
    const { callEsportAction } = require('../../core/esport-api/router.js');
    return callEsportAction(String(action || ''), body || {}, String(token || ''));
  });

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

require('../web/index.js');

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

  // 立即加载本地 loading 页，不阻塞等待 server 启动
  win.loadFile(path.join(__dirname, 'loading.html'));

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
app.whenReady().then(() => {
  registerRelayIpc();
  const win = createWindow();   // 窗口立即打开，显示 loading.html

  // server 在后台启动，就绪后切换到真正的 app
  waitForServer()
    .then(() => {
      if (!win.isDestroyed()) win.loadURL(`http://127.0.0.1:${PORT}/app/`);
    })
    .catch((err) => {
      console.error('[electron] server failed to start:', err.message);
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', async () => {
  if (_rayCore) await _rayCore.stop();
  if (_obCore)  _obCore.stop();
  if (_tfCore)  _tfCore.stop();
  if (_iaCore)  _iaCore.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
