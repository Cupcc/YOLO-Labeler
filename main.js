const { app, BrowserWindow, ipcMain, dialog, nativeTheme, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow;
let isCheckingForUpdates = false;
let pythonProcess = null;
let modelLoaded = false;
let modelClasses = [];
let requestIdCounter = 0;
const pendingRequests = new Map(); // id -> { resolve, timeout, type }

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
    // 窗口关闭时停止推理进程、清除模型状态，并清除保存的模型路径（下次打开必须重新选择模型）
    stopInferenceProcess();
    modelLoaded = false;
    modelClasses = [];
    saveConfig({ modelPath: null });
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

  try {
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

    for (let i = labeledImages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [labeledImages[i], labeledImages[j]] = [labeledImages[j], labeledImages[i]];
    }

    const total = labeledImages.length;
    const trainCount = Math.round(total * ratios.train);
    const valCount = Math.round(total * ratios.val);

    const splits = {
      train: labeledImages.slice(0, trainCount),
      val: labeledImages.slice(trainCount, trainCount + valCount),
      test: labeledImages.slice(trainCount + valCount)
    };

    const dirs = [
      'images/train', 'images/val', 'images/test',
      'labels/train', 'labels/val', 'labels/test'
    ];
    for (const dir of dirs) {
      fs.mkdirSync(path.join(exportDir, dir), { recursive: true });
    }

    for (const [split, images] of Object.entries(splits)) {
      for (const img of images) {
        const destImage = path.join(exportDir, 'images', split, img.imageName);
        const destLabel = path.join(exportDir, 'labels', split, img.imageName.replace(/\.[^.]+$/, '.txt'));
        fs.copyFileSync(img.imagePath, destImage);
        fs.copyFileSync(img.labelPath, destLabel);
      }
    }

    const classesPath = path.join(sourceDir, 'classes.txt');
    if (fs.existsSync(classesPath)) {
      fs.copyFileSync(classesPath, path.join(exportDir, 'classes.txt'));
    }

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

// 打开模型文件选择对话框
ipcMain.handle('dialog:openModelFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'YOLO Model', extensions: ['pt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    title: '选择 YOLO 模型文件'
  });
  return result.canceled ? null : result.filePaths[0];
});

// 保存模型路径到配置
ipcMain.handle('config:saveModelPath', (event, modelPath) => {
  return saveConfig({ modelPath: modelPath });
});

// 获取保存的模型路径
ipcMain.handle('config:getModelPath', () => {
  const config = readConfig();
  const modelPath = config.modelPath;
  // 检查文件是否仍然存在
  if (modelPath && fs.existsSync(modelPath)) {
    return modelPath;
  }
  return null;
});

// ========== 模型管理 ==========
function startInferenceProcess() {
  if (pythonProcess) return;
  let cmd, args;
  if (app.isPackaged) {
    // 打包后使用 PyInstaller 编译的独立可执行文件
    const exeName = process.platform === 'win32' ? 'inference.exe' : 'inference';
    cmd = path.join(process.resourcesPath, exeName);
    args = [];
  } else {
    // 开发环境直接运行 Python 脚本
    cmd = process.platform === 'win32' ? 'python' : 'python3';
    args = [path.join(__dirname, 'inference.py')];
  }
  pythonProcess = spawn(cmd, args, {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let buffer = '';
  pythonProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const result = JSON.parse(line);
        const reqId = result.id;
        const pending = reqId !== undefined && reqId !== null ? pendingRequests.get(reqId) : null;

        if (result.status === 'success') {
          if (result.classes) {
            modelClasses = result.classes;
            modelLoaded = true;
            if (mainWindow) mainWindow.webContents.send('model:loaded', result.classes);
            if (pending) {
              clearTimeout(pending.timeout);
              pending.resolve({ success: true, classes: result.classes });
              pendingRequests.delete(reqId);
            }
          } else if (result.data !== undefined) {
            if (mainWindow) mainWindow.webContents.send('model:detection', result.data);
            if (pending) {
              clearTimeout(pending.timeout);
              pending.resolve({ success: true, data: result.data });
              pendingRequests.delete(reqId);
            }
          }
        } else if (result.status === 'error') {
          if (mainWindow) mainWindow.webContents.send('model:error', result.message);
          if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve({ success: false, error: result.message });
            pendingRequests.delete(reqId);
          }
        }
      } catch (e) {
        console.error('Parse JSON:', e);
      }
    }
  });
  pythonProcess.stderr.on('data', (data) => console.error('Python:', data.toString()));
  pythonProcess.on('exit', (code) => {
    pythonProcess = null;
    modelLoaded = false;
    // 清理所有未完成的 pending 请求
    for (const [id, req] of pendingRequests) {
      clearTimeout(req.timeout);
      req.resolve({ success: false, error: '推理进程已退出' });
    }
    pendingRequests.clear();
  });
}

function stopInferenceProcess() {
  if (pythonProcess) {
    pythonProcess.kill();
    pythonProcess = null;
  }
  modelLoaded = false;
  modelClasses = [];
  // 清理所有未完成的 pending 请求
  for (const [id, req] of pendingRequests) {
    clearTimeout(req.timeout);
    req.resolve({ success: false, error: '推理进程已停止' });
  }
  pendingRequests.clear();
}

ipcMain.handle('model:load', async (event, modelPath) => {
  if (!modelPath || !fs.existsSync(modelPath)) {
    return { success: false, error: '模型文件不存在' };
  }
  try {
    startInferenceProcess();
    await new Promise(r => setTimeout(r, 500));
    if (!pythonProcess || !pythonProcess.stdin) {
      return { success: false, error: '无法启动推理进程' };
    }
    const reqId = ++requestIdCounter;
    pythonProcess.stdin.write(JSON.stringify({ id: reqId, command: 'load_model', path: modelPath }) + '\n', 'utf-8');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (pendingRequests.has(reqId)) {
          pendingRequests.delete(reqId);
          resolve({ success: false, error: '模型加载超时' });
        }
      }, 30000);
      pendingRequests.set(reqId, { resolve, timeout, type: 'load' });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('model:detect', async (event, imagePath, confThreshold = 0.25) => {
  if (!modelLoaded || !pythonProcess) return { success: false, error: '模型未加载' };
  if (!fs.existsSync(imagePath)) return { success: false, error: '图片文件不存在' };
  try {
    const reqId = ++requestIdCounter;
    pythonProcess.stdin.write(JSON.stringify({ id: reqId, command: 'detect', image_path: imagePath, conf: confThreshold }) + '\n', 'utf-8');
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (pendingRequests.has(reqId)) {
          pendingRequests.delete(reqId);
          resolve({ success: false, error: '检测超时' });
        }
      }, 30000);
      pendingRequests.set(reqId, { resolve, timeout, type: 'detect' });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('model:getStatus', () => ({ loaded: modelLoaded, classes: modelClasses }));
ipcMain.handle('model:close', () => { stopInferenceProcess(); return true; });

app.on('before-quit', () => { stopInferenceProcess(); });
