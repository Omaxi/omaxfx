const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tradePastDesktop', {
  isElectron: true,
  exportAnalyticsPdf: (html) => ipcRenderer.invoke('tradepast:export-analytics-pdf', { html }),
});
