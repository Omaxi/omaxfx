const { contextBridge } = require('electron');

// Expose only harmless application metadata. The renderer does not receive
// Node.js or Electron APIs directly.
contextBridge.exposeInMainWorld('omaxfxDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
}));
