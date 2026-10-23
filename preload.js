const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  get: url => ipcRenderer.invoke('api:get', url),
  audio: url => ipcRenderer.invoke('api:audio', url),
  call: (name, ...args) => ipcRenderer.invoke('api:call', name, ...args),
  countries: () => ipcRenderer.invoke('api:countries'),
  open: url => ipcRenderer.invoke('shell:open', url),
  tree: (root, heard, run, saved) => ipcRenderer.invoke('tree:grow', root, heard, run, saved),
  treeMore: id => ipcRenderer.invoke('tree:more', id),
  onTreeNode: cb => ipcRenderer.on('tree:node', (e, run, node) => cb(run, node)),
});
contextBridge.exposeInMainWorld('spotify', {
  status: () => ipcRenderer.invoke('spotify:status'),
  connect: clientId => ipcRenderer.invoke('spotify:connect', clientId),
  disconnect: () => ipcRenderer.invoke('spotify:disconnect'),
  devices: () => ipcRenderer.invoke('spotify:devices'),
  play: (track, deviceId) => ipcRenderer.invoke('spotify:play', track, deviceId),
  exportPlaylist: (name, tracks) => ipcRenderer.invoke('spotify:export', name, tracks),
});
contextBridge.exposeInMainWorld('store', {
  load: () => ipcRenderer.invoke('store:load'),
  save: profile => ipcRenderer.invoke('store:save', profile),
});
