const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  get: url => ipcRenderer.invoke('api:get', url),
  audio: url => ipcRenderer.invoke('api:audio', url),
  call: (name, ...args) => ipcRenderer.invoke('api:call', name, ...args),
  countries: () => ipcRenderer.invoke('api:countries'),
});
contextBridge.exposeInMainWorld('store', {
  load: () => ipcRenderer.invoke('store:load'),
  save: profile => ipcRenderer.invoke('store:save', profile),
});
