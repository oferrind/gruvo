const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  get: url => ipcRenderer.invoke('api:get', url),
  audio: url => ipcRenderer.invoke('api:audio', url),
  call: (name, ...args) => ipcRenderer.invoke('api:call', name, ...args),
  countries: () => ipcRenderer.invoke('api:countries'),
  open: url => ipcRenderer.invoke('shell:open', url),
  tree: (root, heard, run) => ipcRenderer.invoke('tree:grow', root, heard, run),
  treeMore: id => ipcRenderer.invoke('tree:more', id),
  onTreeNode: cb => ipcRenderer.on('tree:node', (e, run, node) => cb(run, node)),
});
contextBridge.exposeInMainWorld('store', {
  load: () => ipcRenderer.invoke('store:load'),
  save: profile => ipcRenderer.invoke('store:save', profile),
});
