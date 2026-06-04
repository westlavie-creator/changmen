'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// IPC esport 仅在 packaged 模式下启用（dev 模式 server 是子进程，store 实例独立）
contextBridge.exposeInMainWorld('gamebetApi', {
  esport: process.env.GAMEBET_ELECTRON_IPC === '1'
    ? (action, body, token) => ipcRenderer.invoke('gamebetApi:esport', action, body, token)
    : undefined,
});

const _isPackaged = process.env.GAMEBET_ELECTRON_IPC === '1';

// TF relay IPC 仅 packaged 模式启用（dev 模式 store 在子进程，gateway 取不到）
const _tfRelay = _isPackaged ? {
  start:     (token) => ipcRenderer.invoke('gamebet:relay:tf:start', token),
  stop:      ()      => ipcRenderer.invoke('gamebet:relay:tf:stop'),
  status:    ()      => ipcRenderer.invoke('gamebet:relay:tf:status'),
  onMessage: (callback) => on('gamebet:relay:tf:message', callback),
} : null;

// IA relay IPC 仅 packaged 模式启用（同 TF：主进程 store 在 dev 下为空）
const _iaRelay = _isPackaged ? {
  start:     ()         => ipcRenderer.invoke('gamebet:relay:ia:start'),
  stop:      ()         => ipcRenderer.invoke('gamebet:relay:ia:stop'),
  status:    ()         => ipcRenderer.invoke('gamebet:relay:ia:status'),
  onMessage: (callback) => on('gamebet:relay:ia:message', callback),
} : null;

contextBridge.exposeInMainWorld('gamebetRelays', {
  tf: _tfRelay,
  ia: _iaRelay,
  ray: {
    start: () => ipcRenderer.invoke('gamebet:relay:ray:start'),
    stop: () => ipcRenderer.invoke('gamebet:relay:ray:stop'),
    status: () => ipcRenderer.invoke('gamebet:relay:ray:status'),
    onMessage: (callback) => on('gamebet:relay:ray:message', callback),
  },
  ob: {
    start: () => ipcRenderer.invoke('gamebet:relay:ob:start'),
    stop: () => ipcRenderer.invoke('gamebet:relay:ob:stop'),
    status: () => ipcRenderer.invoke('gamebet:relay:ob:status'),
    subscribe: (topic) => ipcRenderer.invoke('gamebet:relay:ob:subscribe', topic),
    unsubscribe: (topic) => ipcRenderer.invoke('gamebet:relay:ob:unsubscribe', topic),
    publish: (topic, payload) => ipcRenderer.invoke('gamebet:relay:ob:publish', topic, payload),
    onMessage: (callback) => on('gamebet:relay:ob:message', callback),
  },
});
