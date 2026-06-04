'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// server.js 始终在主进程内 require，store 共享，所有 IPC 路径无条件启用。
contextBridge.exposeInMainWorld('gamebetApi', {
  esport: (action, body, token) =>
    ipcRenderer.invoke('gamebetApi:esport', action, body, token),
});

contextBridge.exposeInMainWorld('gamebetRelays', {
  tf: {
    start:     (token) => ipcRenderer.invoke('gamebet:relay:tf:start', token),
    stop:      ()      => ipcRenderer.invoke('gamebet:relay:tf:stop'),
    status:    ()      => ipcRenderer.invoke('gamebet:relay:tf:status'),
    onMessage: (callback) => on('gamebet:relay:tf:message', callback),
  },
  ia: {
    start:     ()         => ipcRenderer.invoke('gamebet:relay:ia:start'),
    stop:      ()         => ipcRenderer.invoke('gamebet:relay:ia:stop'),
    status:    ()         => ipcRenderer.invoke('gamebet:relay:ia:status'),
    onMessage: (callback) => on('gamebet:relay:ia:message', callback),
  },
  ray: {
    start: () => ipcRenderer.invoke('gamebet:relay:ray:start'),
    stop:  () => ipcRenderer.invoke('gamebet:relay:ray:stop'),
    status: () => ipcRenderer.invoke('gamebet:relay:ray:status'),
    onMessage: (callback) => on('gamebet:relay:ray:message', callback),
  },
  ob: {
    start:       () => ipcRenderer.invoke('gamebet:relay:ob:start'),
    stop:        () => ipcRenderer.invoke('gamebet:relay:ob:stop'),
    status:      () => ipcRenderer.invoke('gamebet:relay:ob:status'),
    subscribe:   (topic)          => ipcRenderer.invoke('gamebet:relay:ob:subscribe', topic),
    unsubscribe: (topic)          => ipcRenderer.invoke('gamebet:relay:ob:unsubscribe', topic),
    publish:     (topic, payload) => ipcRenderer.invoke('gamebet:relay:ob:publish', topic, payload),
    onMessage:   (callback) => on('gamebet:relay:ob:message', callback),
  },
});
