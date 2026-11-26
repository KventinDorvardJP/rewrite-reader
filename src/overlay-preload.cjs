const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('publishPopupBounds', (bounds) => {
  ipcRenderer.send('yomitan-popup-bounds', bounds);
});
