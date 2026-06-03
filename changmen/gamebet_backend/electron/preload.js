'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('gamebetApi', {
  esport: (action, body, token) =>
    ipcRenderer.invoke('gamebetApi:esport', action, body, token),
});

contextBridge.exposeInMainWorld('gamebetRelays', {
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
