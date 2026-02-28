const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 对话框
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  showConfirm: (options) => ipcRenderer.invoke('dialog:showConfirm', options),
  
  // 文件操作
  getImages: (dirPath) => ipcRenderer.invoke('files:getImages', dirPath),
  readImage: (imagePath) => ipcRenderer.invoke('files:readImage', imagePath),
  readLabels: (imagePath) => ipcRenderer.invoke('files:readLabels', imagePath),
  saveLabels: (imagePath, labels) => ipcRenderer.invoke('files:saveLabels', imagePath, labels),
  deleteFile: (filePath) => ipcRenderer.invoke('files:deleteFile', filePath),
  readClasses: (dirPath) => ipcRenderer.invoke('files:readClasses', dirPath),
  saveClasses: (dirPath, classes) => ipcRenderer.invoke('files:saveClasses', dirPath, classes),
  fileExists: (filePath) => ipcRenderer.invoke('files:exists', filePath),
  
  // 配置
  saveLastDirectory: (dirPath) => ipcRenderer.invoke('config:saveLastDirectory', dirPath),
  getLastDirectory: () => ipcRenderer.invoke('config:getLastDirectory'),
  saveModelPath: (modelPath) => ipcRenderer.invoke('config:saveModelPath', modelPath),
  getModelPath: () => ipcRenderer.invoke('config:getModelPath'),
  
  // 模型相关
  openModelFile: () => ipcRenderer.invoke('dialog:openModelFile'),
  loadModel: (modelPath) => ipcRenderer.invoke('model:load', modelPath),
  detectImage: (imagePath, confThreshold) => ipcRenderer.invoke('model:detect', imagePath, confThreshold),
  getModelStatus: () => ipcRenderer.invoke('model:getStatus'),
  closeModel: () => ipcRenderer.invoke('model:close'),
  onModelLoaded: (callback) => ipcRenderer.on('model:loaded', (event, classes) => callback(classes)),
  onModelError: (callback) => ipcRenderer.on('model:error', (event, error) => callback(error)),
  onModelDetection: (callback) => ipcRenderer.on('model:detection', (event, data) => callback(data)),
  
  // 主题
  onThemeUpdated: (callback) => ipcRenderer.on('theme:updated', (event, isDark) => callback(isDark)),
  getIsDark: () => ipcRenderer.invoke('theme:getIsDark'),

  // 导出
  selectExportDir: () => ipcRenderer.invoke('dialog:selectExportDir'),
  splitDataset: (options) => ipcRenderer.invoke('export:splitDataset', options)
});
