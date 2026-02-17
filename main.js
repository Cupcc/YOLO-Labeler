const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

let mainWindow;
let isCheckingForUpdates = false;

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

function setupAutoUpdater() {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('update-downloaded', async () => {
    if (!mainWindow) {
      return;
    }
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
      title: '更新已下载',
      message: '新版本已下载，是否立即重启应用以完成更新？'
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', error => {
    console.error('Auto update error:', error);
  });

  autoUpdater.checkForUpdatesAndNotify();
}

function getUpdateErrorPresentation(error) {
  const message = error?.message || '未知错误';
  const statusCode = error?.statusCode || error?.response?.statusCode;
  const extra = statusCode ? ` (HTTP ${statusCode})` : '';

  return {
    type: 'error',
    title: '检查更新失败',
    message: `无法完成更新检查：${message}${extra}`
  };
}

function setupAppMenu() {
  const locale = app.getLocale?.() || '';
  const isZh = locale.toLowerCase().startsWith('zh');
  const updateLabel = isZh ? '检查更新' : 'Check for Updates';
  const aboutLabel = isZh ? '关于' : 'About';

  const template = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: updateLabel,
          click: manualCheckForUpdates
        },
        { type: 'separator' },
        {
          label: aboutLabel,
          click: showAboutDialog
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function showAboutDialog() {
  const locale = app.getLocale?.() || '';
  const isZh = locale.toLowerCase().startsWith('zh');
  const appName = app.getName();
  const version = app.getVersion();
  const { electron, chrome, node, v8 } = process.versions || {};
  const platform = `${process.platform} ${process.arch}`;
  const buildLabel = app.isPackaged ? 'Production' : 'Development';
  const appPath = app.getAppPath();
  let pkgInfo = {};
  try {
    const pkgPath = path.join(appPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const raw = fs.readFileSync(pkgPath, 'utf-8');
      pkgInfo = JSON.parse(raw);
    }
  } catch (error) {
    console.error('Error reading package.json:', error);
  }
  const normalizeRepoUrl = urlValue => {
    if (!urlValue) {
      return '';
    }
    let url = urlValue.trim();
    if (url.startsWith('github:')) {
      url = `https://github.com/${url.slice('github:'.length)}`;
    }
    if (url.startsWith('git+')) {
      url = url.slice('git+'.length);
    }
    if (url.endsWith('.git')) {
      url = url.slice(0, -4);
    }
    return url;
  };
  const author = typeof pkgInfo.author === 'string' ? pkgInfo.author : pkgInfo.author?.name;
  const repositoryUrl = typeof pkgInfo.repository === 'string'
    ? pkgInfo.repository
    : pkgInfo.repository?.url;
  const homepage = pkgInfo.homepage || '';
  const publishEntries = Array.isArray(pkgInfo.build?.publish) ? pkgInfo.build.publish : [];
  const publishGithub = publishEntries.find(entry => entry?.provider === 'github' && entry?.owner && entry?.repo);
  const publishRepoUrl = publishGithub ? `https://github.com/${publishGithub.owner}/${publishGithub.repo}` : '';
  const officialUrl = normalizeRepoUrl(repositoryUrl) || homepage || publishRepoUrl;
  const title = isZh ? `关于 ${appName}` : `About ${appName}`;
  const lines = isZh
    ? [
      appName,
      `版本：${version}`,
      author ? `作者：${author}` : '',
      officialUrl ? `官网：${officialUrl}` : '',
      `构建：${buildLabel}`,
      `平台：${platform}`,
      `Electron：${electron || ''}`,
      `Chrome：${chrome || ''}`,
      `Node：${node || ''}`,
      `V8：${v8 || ''}`
    ]
    : [
      appName,
      `Version: ${version}`,
      author ? `Author: ${author}` : '',
      officialUrl ? `Official: ${officialUrl}` : '',
      `Build: ${buildLabel}`,
      `Platform: ${platform}`,
      `Electron: ${electron || ''}`,
      `Chrome: ${chrome || ''}`,
      `Node: ${node || ''}`,
      `V8: ${v8 || ''}`
    ];
  const message = lines.filter(Boolean).join('\n');

  dialog.showMessageBox({
    type: 'info',
    title,
    message
  });
}

function manualCheckForUpdates() {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: '仅在打包后的应用中可检查更新。'
    });
    return;
  }

  // 防止重复检查
  if (isCheckingForUpdates) {
    return;
  }
  isCheckingForUpdates = true;

  let handled = false;

  const cleanup = () => {
    isCheckingForUpdates = false;
    autoUpdater.removeListener('update-available', onAvailable);
    autoUpdater.removeListener('update-not-available', onNotAvailable);
    autoUpdater.removeListener('error', onError);
  };

  const onAvailable = info => {
    if (handled) return;
    handled = true;
    cleanup();
    dialog.showMessageBox({
      type: 'info',
      title: '发现新版本',
      message: `发现新版本 ${info?.version || ''}，正在下载...`
    });
  };

  const onNotAvailable = () => {
    if (handled) return;
    handled = true;
    cleanup();
    dialog.showMessageBox({
      type: 'info',
      title: '检查更新',
      message: '当前已是最新版本。'
    });
  };

  const onError = error => {
    if (handled) return;
    handled = true;
    cleanup();
    const presentation = getUpdateErrorPresentation(error);
    dialog.showMessageBox(presentation);
  };

  autoUpdater.once('update-available', onAvailable);
  autoUpdater.once('update-not-available', onNotAvailable);
  autoUpdater.once('error', onError);
  autoUpdater.checkForUpdates().catch(onError);
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  setupAppMenu();
});

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

// 删除图片和对应的标注文件
ipcMain.handle('files:deleteFile', async (event, imagePath) => {
  try {
    // 删除图片文件
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
    
    // 删除对应的标注文件
    const labelPath = imagePath.replace(/\.[^.]+$/, '.txt');
    if (fs.existsSync(labelPath)) {
      fs.unlinkSync(labelPath);
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
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

// 选择导出目录
ipcMain.handle('dialog:selectExportDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '选择导出目录',
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

// 导出切分数据集
ipcMain.handle('export:splitDataset', async (event, options) => {
  const { sourceDir, exportDir, ratios, classNames } = options;
  // ratios = { train: 0.8, val: 0.1, test: 0.1 }

  try {
    // 收集所有有标注的图片
    const files = fs.readdirSync(sourceDir);
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
    const labeledImages = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!imageExtensions.includes(ext)) continue;

      const imagePath = path.join(sourceDir, file);
      const labelPath = imagePath.replace(/\.[^.]+$/, '.txt');
      if (fs.existsSync(labelPath)) {
        const labelContent = fs.readFileSync(labelPath, 'utf-8').trim();
        if (labelContent.length > 0) {
          labeledImages.push({ imageName: file, imagePath, labelPath });
        }
      }
    }

    if (labeledImages.length === 0) {
      return { success: false, message: '没有找到已标注的图片' };
    }

    // 打乱顺序
    for (let i = labeledImages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [labeledImages[i], labeledImages[j]] = [labeledImages[j], labeledImages[i]];
    }

    // 按比例切分
    const total = labeledImages.length;
    const trainCount = Math.round(total * ratios.train);
    const valCount = Math.round(total * ratios.val);

    const splits = {
      train: labeledImages.slice(0, trainCount),
      val: labeledImages.slice(trainCount, trainCount + valCount),
      test: labeledImages.slice(trainCount + valCount)
    };

    // 创建目录结构
    const dirs = [
      'images/train', 'images/val', 'images/test',
      'labels/train', 'labels/val', 'labels/test'
    ];
    for (const dir of dirs) {
      const fullPath = path.join(exportDir, dir);
      fs.mkdirSync(fullPath, { recursive: true });
    }

    // 复制文件
    for (const [split, images] of Object.entries(splits)) {
      for (const img of images) {
        const destImage = path.join(exportDir, 'images', split, img.imageName);
        const destLabel = path.join(exportDir, 'labels', split, img.imageName.replace(/\.[^.]+$/, '.txt'));
        fs.copyFileSync(img.imagePath, destImage);
        fs.copyFileSync(img.labelPath, destLabel);
      }
    }

    // 复制 classes.txt
    const classesPath = path.join(sourceDir, 'classes.txt');
    if (fs.existsSync(classesPath)) {
      fs.copyFileSync(classesPath, path.join(exportDir, 'classes.txt'));
    }

    // 生成 data.yaml
    const yamlLines = [
      `path: ${exportDir.replace(/\\/g, '/')}`,
      `train: images/train`,
      `val: images/val`,
      `test: images/test`,
      ``,
      `nc: ${classNames.length}`,
      `names: [${classNames.map(n => `'${n}'`).join(', ')}]`
    ];
    fs.writeFileSync(path.join(exportDir, 'data.yaml'), yamlLines.join('\n'), 'utf-8');

    return {
      success: true,
      message: `导出完成`,
      stats: {
        total: labeledImages.length,
        train: splits.train.length,
        val: splits.val.length,
        test: splits.test.length
      }
    };
  } catch (error) {
    console.error('Error exporting dataset:', error);
    return { success: false, message: `导出失败: ${error.message}` };
  }
});

