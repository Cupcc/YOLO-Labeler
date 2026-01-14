const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// 配置文件路径
const configPath = path.join(app.getPath('userData'), 'config.json');

// 读取配置
function readConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
  return {};
}

// 保存配置
function saveConfig(config) {
  try {
    const existing = readConfig();
    const merged = { ...existing, ...config };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f0f1a' : '#f5f5f7',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'src', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // 监听系统主题变化并通知渲染进程
  nativeTheme.on('updated', () => {
    if (mainWindow) {
      mainWindow.webContents.send('theme:updated', nativeTheme.shouldUseDarkColors);
      mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0f0f1a' : '#f5f5f7');
    }
  });

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC 处理器

// 打开目录选择对话框
ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// 获取目录中的图片文件列表
ipcMain.handle('files:getImages', async (event, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
    const images = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    }).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    
    return images.map(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: stats.size
      };
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

// 读取图片文件为 base64
ipcMain.handle('files:readImage', async (event, imagePath) => {
  try {
    const data = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase().slice(1);
    const mimeType = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mimeType};base64,${data.toString('base64')}`;
  } catch (error) {
    console.error('Error reading image:', error);
    return null;
  }
});

// 读取标注文件
ipcMain.handle('files:readLabels', async (event, imagePath) => {
  try {
    const labelPath = imagePath.replace(/\.[^.]+$/, '.txt');
    if (fs.existsSync(labelPath)) {
      const content = fs.readFileSync(labelPath, 'utf-8');
      return content.trim();
    }
    return '';
  } catch (error) {
    console.error('Error reading labels:', error);
    return '';
  }
});

// 保存标注文件
ipcMain.handle('files:saveLabels', async (event, imagePath, labels) => {
  try {
    const labelPath = imagePath.replace(/\.[^.]+$/, '.txt');
    fs.writeFileSync(labelPath, labels, 'utf-8');
    return true;
  } catch (error) {
    console.error('Error saving labels:', error);
    return false;
  }
});

// 读取 classes.txt
ipcMain.handle('files:readClasses', async (event, dirPath) => {
  try {
    const classesPath = path.join(dirPath, 'classes.txt');
    if (fs.existsSync(classesPath)) {
      const content = fs.readFileSync(classesPath, 'utf-8');
      return content.trim().split('\n').filter(line => line.trim());
    }
    return [];
  } catch (error) {
    console.error('Error reading classes:', error);
    return [];
  }
});

// 保存 classes.txt
ipcMain.handle('files:saveClasses', async (event, dirPath, classes) => {
  try {
    const classesPath = path.join(dirPath, 'classes.txt');
    fs.writeFileSync(classesPath, classes.join('\n'), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error saving classes:', error);
    return false;
  }
});

// 检查文件是否存在
ipcMain.handle('files:exists', async (event, filePath) => {
  return fs.existsSync(filePath);
});

// 获取当前主题状态
ipcMain.handle('theme:getIsDark', () => {
  return nativeTheme.shouldUseDarkColors;
});

// 保存上次打开的工作目录
ipcMain.handle('config:saveLastDirectory', (event, dirPath) => {
  return saveConfig({ lastDirectory: dirPath });
});

// 获取上次打开的工作目录
ipcMain.handle('config:getLastDirectory', () => {
  const config = readConfig();
  const lastDir = config.lastDirectory;
  // 检查目录是否仍然存在
  if (lastDir && fs.existsSync(lastDir)) {
    return lastDir;
  }
  return null;
});

// 显示确认对话框
ipcMain.handle('dialog:showConfirm', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: options.buttons || ['是', '否'],
    defaultId: 0,
    title: options.title || '确认',
    message: options.message
  });
  return result.response === 0;
});
