const { contextBridge, ipcRenderer } = require('electron');

// Expose secure desktop bridge to the renderer
contextBridge.exposeInMainWorld('tendDesktop', {
  platform: process.platform,
  isElectron: true,
  version: process.versions.electron,
});

window.addEventListener('DOMContentLoaded', () => {
  // Add CSS helper classes to document body
  document.body.classList.add('is-electron');
  if (process.platform === 'darwin') {
    document.body.classList.add('is-mac');
  } else if (process.platform === 'win32') {
    document.body.classList.add('is-windows');
  } else {
    document.body.classList.add('is-linux');
  }
});
