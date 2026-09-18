// Cầu nối tối thiểu giữa giao diện và tiến trình chính: chỉ chuyện màn hình và cửa sổ xuất.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ledPortal', {
  listDisplays: () => ipcRenderer.invoke('displays:list'),
  openOutput: (opts) => ipcRenderer.invoke('output:open', opts),
  closeOutput: (id) => ipcRenderer.invoke('output:close', id),
  closeAllOutputs: () => ipcRenderer.invoke('output:closeAll'),
  listOutputs: () => ipcRenderer.invoke('output:list'),
  onOutputsChanged: (fn) => ipcRenderer.on('outputs:changed', (_e, list) => fn(list)),
  onDisplaysChanged: (fn) => ipcRenderer.on('displays:changed', () => fn()),
});
