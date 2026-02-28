/**
 * 主渲染进程 - 整合所有模块
 */

// 初始化模块
const canvas = new CanvasManager('main-canvas');
const fileManager = new FileManager();
const classManager = new ClassManager();
const modelManager = new ModelManager();

// DOM 元素
const elements = {
  // 工具栏
  btnOpenDir: document.getElementById('btn-open-dir'),
  btnSave: document.getElementById('btn-save'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  btnLoadModel: document.getElementById('btn-load-model'),
  btnAutoLabel: document.getElementById('btn-auto-label'),
  btnBatchLabel: document.getElementById('btn-batch-label'),
  currentFile: document.getElementById('current-file'),
  saveStatus: document.getElementById('save-status'),
  
  // 画布缩放控制
  btnZoomIn: document.getElementById('btn-zoom-in'),
  btnZoomOut: document.getElementById('btn-zoom-out'),
  btnZoomFit: document.getElementById('btn-zoom-fit'),
  zoomLevel: document.getElementById('zoom-level'),
  
  // 左侧面板
  fileList: document.getElementById('file-list'),
  fileCount: document.getElementById('file-count'),
  
  // 右侧面板
  classList: document.getElementById('class-list'),
  classCount: document.getElementById('class-count'),
  btnAddClass: document.getElementById('btn-add-class'),
  labelList: document.getElementById('label-list'),
  labelCount: document.getElementById('label-count'),
  
  // 画布
  emptyState: document.getElementById('empty-state'),
  mousePos: document.getElementById('mouse-pos'),
  boxSize: document.getElementById('box-size'),
  imageInfo: document.getElementById('image-info'),
  
  // 弹窗
  classModal: document.getElementById('class-modal'),
  modalClassList: document.getElementById('modal-class-list'),
  modalClose: document.getElementById('modal-close'),
  addClassModal: document.getElementById('add-class-modal'),
  newClassInput: document.getElementById('new-class-input'),
  btnConfirmAddClass: document.getElementById('btn-confirm-add-class'),
  btnCancelAddClass: document.getElementById('btn-cancel-add-class'),
  addClassModalClose: document.getElementById('add-class-modal-close'),

  // 导出
  btnExport: document.getElementById('btn-export'),
  exportModal: document.getElementById('export-modal'),
  exportModalClose: document.getElementById('export-modal-close'),
  exportLabeledCount: document.getElementById('export-labeled-count'),
  exportUnlabeledCount: document.getElementById('export-unlabeled-count'),
  splitRatioBar: document.getElementById('split-ratio-bar'),
  splitTrain: document.getElementById('split-train'),
  splitVal: document.getElementById('split-val'),
  splitTest: document.getElementById('split-test'),
  splitHandle1: document.getElementById('split-handle-1'),
  splitHandle2: document.getElementById('split-handle-2'),
  ratioTrainPct: document.getElementById('ratio-train-pct'),
  ratioValPct: document.getElementById('ratio-val-pct'),
  ratioTestPct: document.getElementById('ratio-test-pct'),
  ratioTrainCount: document.getElementById('ratio-train-count'),
  ratioValCount: document.getElementById('ratio-val-count'),
  ratioTestCount: document.getElementById('ratio-test-count'),
  exportPathInput: document.getElementById('export-path-input'),
  btnSelectExportDir: document.getElementById('btn-select-export-dir'),
  btnCancelExport: document.getElementById('btn-cancel-export'),
  btnConfirmExport: document.getElementById('btn-confirm-export')
};

// 应用状态
const state = {
  pendingRect: null,  // 等待分配类别的矩形
  pendingAnnotationIndex: -1,
  hasUnsavedChanges: false
};

// ========== 初始化 ==========

async function init() {
  bindEvents();
  bindCallbacks();
  registerShortcuts();
  updateUIState();
  
  // 初始化主题
  const isDark = await window.electronAPI.getIsDark();
  updateTheme(isDark);
  
  // 监听主题变化
  window.electronAPI.onThemeUpdated((isDark) => {
    updateTheme(isDark);
  });
  
  // 每次打开程序需用户手动加载模型，不再自动加载上次模型
  
  // 检查是否有上次打开的工作目录
  await checkLastDirectory();
}

// 检查并询问是否恢复上次的工作目录
async function checkLastDirectory() {
  const lastDir = await window.electronAPI.getLastDirectory();
  if (lastDir) {
    const shouldOpen = await window.electronAPI.showConfirm({
      title: '恢复工作目录',
      message: `是否打开上次的工作目录？\n\n${lastDir}`,
      buttons: ['打开', '取消']
    });
    
    if (shouldOpen) {
      await loadDirectory(lastDir);
    }
  }
}

// 加载指定目录
async function loadDirectory(dirPath) {
  fileManager.currentDir = dirPath;
  fileManager.images = await window.electronAPI.getImages(dirPath);
  fileManager.currentIndex = fileManager.images.length > 0 ? 0 : -1;
  
  if (fileManager.onImagesLoaded) {
    fileManager.onImagesLoaded(fileManager.images, fileManager.currentDir);
  }
  
  await classManager.loadClasses(dirPath);
  canvas.setClassColors(classManager.getAllColors());
  
  // 保存为上次打开的目录
  await window.electronAPI.saveLastDirectory(dirPath);
}

function updateTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
  } else {
    document.body.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
  }
}

// ========== 事件绑定 ==========

function bindEvents() {
  // 工具栏按钮
  elements.btnOpenDir.addEventListener('click', openDirectory);
  elements.btnSave.addEventListener('click', saveCurrentLabels);
  elements.btnPrev.addEventListener('click', goToPrevImage);
  elements.btnNext.addEventListener('click', goToNextImage);
  elements.btnLoadModel.addEventListener('click', loadModel);
  elements.btnAutoLabel.addEventListener('click', autoLabelCurrentImage);
  elements.btnBatchLabel.addEventListener('click', batchLabelAllImages);
  elements.btnZoomIn.addEventListener('click', () => {
    canvas.zoomIn();
    updateZoomDisplay();
  });
  elements.btnZoomOut.addEventListener('click', () => {
    canvas.zoomOut();
    updateZoomDisplay();
  });
  elements.btnZoomFit.addEventListener('click', () => {
    canvas.fitToView();
    canvas.render();
    updateZoomDisplay();
  });
  
  // 类别管理
  elements.btnAddClass.addEventListener('click', showAddClassModal);
  elements.btnConfirmAddClass.addEventListener('click', confirmAddClass);
  elements.btnCancelAddClass.addEventListener('click', hideAddClassModal);
  elements.addClassModalClose.addEventListener('click', hideAddClassModal);
  elements.newClassInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmAddClass();
    if (e.key === 'Escape') hideAddClassModal();
  });
  
  // 类别选择弹窗
  elements.modalClose.addEventListener('click', hideClassModal);
  elements.classModal.addEventListener('click', (e) => {
    if (e.target === elements.classModal) hideClassModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !elements.classModal.classList.contains('hidden')) {
      e.preventDefault();
      hideClassModal();
    }
  });
  elements.addClassModal.addEventListener('click', (e) => {
    if (e.target === elements.addClassModal) hideAddClassModal();
  });

  // 导出数据集
  elements.btnExport.addEventListener('click', showExportModal);
  elements.exportModalClose.addEventListener('click', hideExportModal);
  elements.btnCancelExport.addEventListener('click', hideExportModal);
  elements.btnSelectExportDir.addEventListener('click', selectExportDir);
  elements.exportPathInput.addEventListener('click', selectExportDir);
  elements.btnConfirmExport.addEventListener('click', confirmExport);
  elements.exportModal.addEventListener('click', (e) => {
    if (e.target === elements.exportModal) hideExportModal();
  });

  // 初始化拖拽滑块
  initSplitSlider();
}

function bindCallbacks() {
  // 文件管理回调
  fileManager.onImagesLoaded = (images, dir) => {
    renderFileList(images);
    elements.fileCount.textContent = images.length;
    if (images.length > 0) {
      // 如果当前索引有效，则加载当前索引的图片，否则加载第一张
      const indexToLoad = (fileManager.currentIndex >= 0 && fileManager.currentIndex < images.length) 
        ? fileManager.currentIndex 
        : 0;
      loadImageAt(indexToLoad);
    } else {
      // 处理没有任何图片的情况
      elements.currentFile.textContent = '未打开文件';
      elements.emptyState.classList.remove('hidden');
      elements.imageInfo.textContent = '';
      canvas.clear();
      updateLabelList();
      updateUIState();
    }
    // 异步检查标注状态
    fileManager.checkLabelsExist();
  };
  
  // 仅更新文件列表UI（标注状态检查完成后调用，不切换图片）
  fileManager.onFileListUpdated = (images) => {
    renderFileList(images);
    highlightFileListItem(fileManager.currentIndex);
  };
  
  fileManager.onImageChanged = async (image, index, imageData) => {
    elements.currentFile.textContent = image.path;
    elements.emptyState.classList.add('hidden');
    
    await canvas.loadImage(imageData);
    updateZoomDisplay();

    // 更新图片信息 (尺寸和大小)
    let sizeText = '';
    if (image.size < 1024 * 1024) {
      sizeText = `${(image.size / 1024).toFixed(2)} KB`;
    } else {
      sizeText = `${(image.size / (1024 * 1024)).toFixed(2)} MB`;
    }
    elements.imageInfo.textContent = `${canvas.image.width} × ${canvas.image.height} | ${sizeText}`;
    
    // 加载标注
    const labels = await fileManager.loadLabels();
    canvas.loadYoloAnnotations(labels, classManager.classes.map(c => classManager.getClassName(c.id)));
    
    updateLabelList();
    highlightFileListItem(index);
    updateUIState();
    updateModelButtons();
  };
  
  fileManager.onSaveStatusChanged = (status) => {
    updateSaveStatus(status);
  };
  
  // 类别管理回调
  classManager.onClassesChanged = (classes) => {
    renderClassList(classes);
    canvas.setClassColors(classManager.getAllColors());
    updateModalClassList(classes);
  };
  
  classManager.onClassSelected = (id, classItem) => {
    highlightClassListItem(id);
  };
  
  // 画布回调
  canvas.onAnnotationCreated = (rect) => {
    state.pendingRect = rect;
    showClassModal();
  };
  
  canvas.onAnnotationSelected = (index) => {
    highlightLabelListItem(index);
  };

  canvas.onAnnotationRelabel = (index) => {
    state.pendingRect = null;
    state.pendingAnnotationIndex = index;
    showClassModal();
  };
  
  canvas.onAnnotationsChanged = () => {
    state.hasUnsavedChanges = true;
    updateLabelList();
    updateSaveStatus('unsaved'); // 显示未保存状态
  };
  
  canvas.onMouseMove = (x, y, currentRect) => {
    elements.mousePos.textContent = `X: ${x}, Y: ${y}`;
    if (currentRect) {
      elements.boxSize.textContent = `W: ${Math.round(currentRect.width)}, H: ${Math.round(currentRect.height)}`;
    } else {
      elements.boxSize.textContent = '';
    }
  };
  
  // 缩放变化回调
  canvas.onZoomChanged = (zoomPercent) => {
    updateZoomDisplay();
  };
}

function registerShortcuts() {
  shortcutManager.registerAll({
    'w': () => {
      if (fileManager.getCurrentImage()) {
        canvas.setDrawMode(true);
      }
    },
    'd': goToNextImage,
    'a': goToPrevImage,
    'del': () => {
      if (canvas.selectedIndex !== -1) {
        canvas.deleteSelected();
      } else {
        deleteCurrentFile();
      }
    },
    'backspace': () => {
      if (canvas.selectedIndex !== -1) {
        canvas.deleteSelected();
      } else {
        deleteCurrentFile();
      }
    },
    'ctrl+s': saveCurrentLabels,
    'ctrl+z': () => {
      canvas.undo();
      updateLabelList();
    },
    'ctrl+y': () => {
      canvas.redo();
      updateLabelList();
    },
    'esc': () => {
      canvas.setDrawMode(false);
      canvas.selectAnnotation(-1);
      hideClassModal();
      hideAddClassModal();
    },
    '1': () => classManager.selectByShortcut('1'),
    '2': () => classManager.selectByShortcut('2'),
    '3': () => classManager.selectByShortcut('3'),
    '4': () => classManager.selectByShortcut('4'),
    '5': () => classManager.selectByShortcut('5'),
    '6': () => classManager.selectByShortcut('6'),
    '7': () => classManager.selectByShortcut('7'),
    '8': () => classManager.selectByShortcut('8'),
    '9': () => classManager.selectByShortcut('9'),
  });
}

// ========== 文件操作 ==========

async function openDirectory() {
  const dir = await fileManager.openDirectory();
  if (dir) {
    await classManager.loadClasses(dir);
    canvas.setClassColors(classManager.getAllColors());
    // 保存为上次打开的目录
    await window.electronAPI.saveLastDirectory(dir);
  }
}

async function loadImageAt(index) {
  // 先保存当前标注
  if (state.hasUnsavedChanges) {
    await saveCurrentLabels();
  }
  
  await fileManager.goToImage(index);
}

async function goToPrevImage() {
  if (fileManager.currentIndex > 0) {
    await loadImageAt(fileManager.currentIndex - 1);
  }
}

async function goToNextImage() {
  if (fileManager.currentIndex < fileManager.images.length - 1) {
    await loadImageAt(fileManager.currentIndex + 1);
  }
}

async function deleteCurrentFile() {
  const currentImage = fileManager.getCurrentImage();
  if (!currentImage) return;

  const confirmed = await window.electronAPI.showConfirm({
    title: '确认删除',
    message: `确定要删除图片 "${currentImage.name}" 及其标注文件吗？\n此操作不可撤销。`,
    buttons: ['删除', '取消']
  });

  if (confirmed) {
    const wasUnsaved = state.hasUnsavedChanges;
    // 暂时设为 false，防止 deleteCurrentImage 触发的 UI 更新导致自动保存已删除的文件
    state.hasUnsavedChanges = false;

    const success = await fileManager.deleteCurrentImage();
    if (!success) {
      // 如果删除失败，恢复未保存状态
      state.hasUnsavedChanges = wasUnsaved;
      alert('删除文件失败');
    }
  }
}

// ========== 保存功能 ==========

async function saveCurrentLabels() {
  const annotations = canvas.getYoloAnnotations();
  const success = await fileManager.saveLabels(annotations);
  if (success) {
    state.hasUnsavedChanges = false;
    // 更新文件列表中的标注指示器
    renderFileList(fileManager.images);
    highlightFileListItem(fileManager.currentIndex);
  }
  return success;
}

// 自动保存已移除，仅在切换图片时保存

function updateSaveStatus(status) {
  elements.saveStatus.className = 'save-status ' + status;
  switch (status) {
    case 'saved':
      elements.saveStatus.textContent = '已保存';
      setTimeout(() => {
        elements.saveStatus.textContent = '';
        elements.saveStatus.className = 'save-status';
      }, 2000);
      break;
    case 'saving':
      elements.saveStatus.textContent = '保存中...';
      break;
    case 'unsaved':
      elements.saveStatus.textContent = '未保存';
      break;
    case 'error':
      elements.saveStatus.textContent = '保存失败';
      break;
    default:
      elements.saveStatus.textContent = '';
  }
}

// ========== UI 渲染 ==========

function renderFileList(images) {
  elements.fileList.innerHTML = images.map((img, index) => `
    <li data-index="${index}" ${index === fileManager.currentIndex ? 'class="active"' : ''}>
      <span class="file-icon">🖼️</span>
      <span class="file-name">${img.name}</span>
      ${img.hasLabels ? '<span class="labeled-indicator"></span>' : ''}
    </li>
  `).join('');
  
  // 绑定点击事件
  elements.fileList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const index = parseInt(li.dataset.index);
      loadImageAt(index);
    });
  });
}

function highlightFileListItem(index) {
  elements.fileList.querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('active', i === index);
  });
  
  // 滚动到可见区域
  const activeItem = elements.fileList.querySelector('li.active');
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function renderClassList(classes) {
  elements.classCount.textContent = classes.length;
  elements.classList.innerHTML = classes.map((cls, index) => `
    <li data-id="${cls.id}" ${cls.id === classManager.selectedClassId ? 'class="active"' : ''}>
      <span class="class-color" style="background: ${cls.color}"></span>
      <span class="class-name">${classManager.getClassName(cls.id)}</span>
      <span class="class-shortcut">${index + 1}</span>
      <button class="class-delete" data-id="${cls.id}" title="删除类别">×</button>
    </li>
  `).join('');
  
  // 绑定点击事件
  elements.classList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', (e) => {
      if (!e.target.classList.contains('class-delete')) {
        const id = parseInt(li.dataset.id);
        classManager.selectClass(id);
      }
    });
  });
  
  // 绑定删除事件
  elements.classList.querySelectorAll('.class-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      if (confirm(`确定要删除类别 "${classManager.getClassName(id)}" 吗？`)) {
        await classManager.deleteClass(id);
      }
    });
  });
}

function highlightClassListItem(id) {
  elements.classList.querySelectorAll('li').forEach(li => {
    li.classList.toggle('active', parseInt(li.dataset.id) === id);
  });
}

function updateLabelList() {
  const annotations = canvas.annotations;
  elements.labelCount.textContent = annotations.length;
  
  elements.labelList.innerHTML = annotations.map((ann, index) => `
    <li data-index="${index}" ${index === canvas.selectedIndex ? 'class="selected"' : ''}>
      <span class="label-color" style="background: ${canvas.getClassColor(ann.classId)}"></span>
      <span class="label-info">
        <span class="label-class">${(ann.className && ann.className.includes(':')) ? ann.className : `${ann.classId}:${ann.className || classManager.getClassName(ann.classId)}`}</span>
      </span>
      <span class="class-shortcut">${index + 1}</span>
      <button class="label-delete" data-index="${index}" title="删除标注">×</button>
    </li>
  `).join('');
  
  // 绑定点击事件
  elements.labelList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', (e) => {
      if (!e.target.classList.contains('label-delete')) {
        const index = parseInt(li.dataset.index);
        canvas.selectAnnotation(index);
        highlightLabelListItem(index);
      }
    });
  });
  
  // 绑定删除事件
  elements.labelList.querySelectorAll('.label-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      canvas.deleteAnnotation(index);
    });
  });
}

function highlightLabelListItem(index) {
  elements.labelList.querySelectorAll('li').forEach((li, i) => {
    li.classList.toggle('selected', i === index);
  });
}

function updateZoomDisplay() {
  elements.zoomLevel.textContent = canvas.getZoomPercent() + '%';
}

function updateUIState() {
  const hasImage = fileManager.getCurrentImage() !== null;
  const hasImages = fileManager.images.length > 0;
  
  elements.btnSave.disabled = !hasImage;
  elements.btnPrev.disabled = !hasImages || fileManager.currentIndex <= 0;
  elements.btnNext.disabled = !hasImages || fileManager.currentIndex >= fileManager.images.length - 1;
  elements.btnZoomIn.disabled = !hasImage;
  elements.btnZoomOut.disabled = !hasImage;
  elements.btnZoomFit.disabled = !hasImage;
  elements.btnExport.disabled = !hasImages;
  updateModelButtons();
}

// ========== 弹窗操作 ==========

function showClassModal() {
  elements.classModal.classList.remove('hidden');
  updateModalClassList(classManager.classes);
  shortcutManager.setEnabled(false);
}

function hideClassModal() {
  elements.classModal.classList.add('hidden');
  state.pendingRect = null;
  state.pendingAnnotationIndex = -1;
  shortcutManager.setEnabled(true);
}

function updateModalClassList(classes) {
  elements.modalClassList.innerHTML = classes.map(cls => `
    <li data-id="${cls.id}">
      <span class="class-color" style="background: ${cls.color}"></span>
      <span class="class-name">${classManager.getClassName(cls.id)}</span>
    </li>
  `).join('');
  
  // 绑定点击事件
  elements.modalClassList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const classId = parseInt(li.dataset.id);
      selectClassForPendingRect(classId);
    });
  });
}

function selectClassForPendingRect(classId) {
  const className = classManager.getClassName(classId);
  if (state.pendingAnnotationIndex >= 0) {
    canvas.updateAnnotationClass(state.pendingAnnotationIndex, classId, className);
    hideClassModal();
    return;
  }
  
  if (!state.pendingRect) {
    hideClassModal();
    return;
  }
  
  const annotation = {
    ...state.pendingRect,
    classId: classId,
    className: className
  };
  
  canvas.addAnnotation(annotation);
  hideClassModal();
}

function showAddClassModal() {
  elements.addClassModal.classList.remove('hidden');
  elements.newClassInput.value = '';
  elements.newClassInput.focus();
}

function hideAddClassModal() {
  elements.addClassModal.classList.add('hidden');
}

async function confirmAddClass() {
  const name = elements.newClassInput.value.trim();
  if (name) {
    const newClass = await classManager.addClass(name);
    if (newClass) {
      hideAddClassModal();
    } else {
      alert('类别名称无效或已存在');
    }
  }
}

// ========== 模型管理 ==========

async function loadModel() {
  try {
    // 每次点击“加载模型”都弹出文件选择框，让用户选择新模型（不静默用上次路径）
    const modelPath = await window.electronAPI.openModelFile();
    if (!modelPath) {
      return; // 用户取消
    }
    
    // 显示加载提示
    elements.saveStatus.textContent = '正在加载模型...';
    elements.saveStatus.className = 'save-status saving';
    
    // 加载模型
    const classes = await modelManager.loadModel(modelPath);
    
    // 更新类别管理器
    await updateClassesFromModel(classes);
    
    // 更新按钮状态
    updateModelButtons();
    
    elements.saveStatus.textContent = '模型加载成功';
    elements.saveStatus.className = 'save-status saved';
    setTimeout(() => {
      elements.saveStatus.textContent = '';
      elements.saveStatus.className = 'save-status';
    }, 2000);
  } catch (error) {
    alert('加载模型失败: ' + error.message);
    elements.saveStatus.textContent = '模型加载失败';
    elements.saveStatus.className = 'save-status error';
    setTimeout(() => {
      elements.saveStatus.textContent = '';
      elements.saveStatus.className = 'save-status';
    }, 3000);
  }
}

async function updateClassesFromModel(classes) {
  if (!classes || classes.length === 0) {
    return;
  }

  if (classManager.classes.length > 0) {
    const confirmed = await window.electronAPI.showConfirm({
      title: '覆盖类别',
      message: `模型包含 ${classes.length} 个类别，这将替换当前已有的 ${classManager.classes.length} 个类别并更新 classes.txt。\n\n是否继续？`,
      buttons: ['继续', '取消']
    });
    if (!confirmed) return;
  }

  classManager.classes = [];

  for (let i = 0; i < classes.length; i++) {
    await classManager.addClass(classes[i]);
  }

  canvas.setClassColors(classManager.getAllColors());
}

// 单张图片自动标注
async function autoLabelCurrentImage() {
  const currentImage = fileManager.getCurrentImage();
  if (!currentImage) {
    alert('请先打开一张图片');
    return;
  }
  
  if (!modelManager.isModelLoaded()) {
    alert('请先加载模型');
    return;
  }
  
  try {
    elements.saveStatus.textContent = '正在标注...';
    elements.saveStatus.className = 'save-status saving';
    elements.btnAutoLabel.disabled = true;
    
    // 执行推理
    const detections = await modelManager.detectImage(currentImage.path, 0.25);
    
    // 转换为画布标注格式
    const annotations = detections.map(det => {
      const width = det.width * canvas.imageWidth;
      const height = det.height * canvas.imageHeight;
      const className = classManager.getClassName(det.classId);
      
      return {
        classId: det.classId,
        className: className,
        x: det.xCenter * canvas.imageWidth - width / 2,
        y: det.yCenter * canvas.imageHeight - height / 2,
        width: width,
        height: height
      };
    });
    
    // 加载到画布
    canvas.annotations = annotations;
    canvas.selectedIndex = -1;
    canvas.render();
    
    // 更新标注列表
    updateLabelList();
    state.hasUnsavedChanges = true;
    updateSaveStatus('unsaved');
    
    elements.saveStatus.textContent = `标注完成，检测到 ${annotations.length} 个目标`;
    elements.saveStatus.className = 'save-status saved';
    setTimeout(() => {
      elements.saveStatus.textContent = '';
      elements.saveStatus.className = 'save-status';
    }, 2000);
  } catch (error) {
    alert('标注失败: ' + error.message);
    elements.saveStatus.textContent = '标注失败';
    elements.saveStatus.className = 'save-status error';
    setTimeout(() => {
      elements.saveStatus.textContent = '';
      elements.saveStatus.className = 'save-status';
    }, 3000);
  } finally {
    elements.btnAutoLabel.disabled = false;
  }
}

// 批量标注所有图片
async function batchLabelAllImages() {
  if (fileManager.images.length === 0) {
    alert('请先打开图片目录');
    return;
  }
  
  if (!modelManager.isModelLoaded()) {
    alert('请先加载模型');
    return;
  }
  
  const confirmed = await window.electronAPI.showConfirm({
    title: '批量标注',
    message: `确定要对 ${fileManager.images.length} 张图片进行批量标注吗？\n这将覆盖现有的标注文件。`,
    buttons: ['确定', '取消']
  });
  
  if (!confirmed) {
    return;
  }
  
  try {
    elements.saveStatus.textContent = '正在批量标注...';
    elements.saveStatus.className = 'save-status saving';
    elements.btnBatchLabel.disabled = true;
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < fileManager.images.length; i++) {
      const image = fileManager.images[i];
      
      try {
        // 执行推理
        const detections = await modelManager.detectImage(image.path, 0.25);
        
        // 转换为 YOLO 格式
        const yoloAnnotations = detections.map(det => {
          return `${det.classId} ${det.xCenter.toFixed(6)} ${det.yCenter.toFixed(6)} ${det.width.toFixed(6)} ${det.height.toFixed(6)}`;
        });
        
        // 保存标注文件
        const labelPath = image.path.replace(/\.[^.]+$/, '.txt');
        const content = yoloAnnotations.join('\n');
        await window.electronAPI.saveLabels(image.path, content);
        
        // 更新文件状态
        fileManager.images[i].hasLabels = yoloAnnotations.length > 0;
        successCount++;
        
        // 更新进度显示
        elements.saveStatus.textContent = `正在标注: ${i + 1}/${fileManager.images.length}`;
      } catch (error) {
        console.error(`标注图片 ${image.name} 失败:`, error);
        errorCount++;
      }
    }
    
    // 更新文件列表
    renderFileList(fileManager.images);
    
    elements.saveStatus.textContent = `批量标注完成: 成功 ${successCount}，失败 ${errorCount}`;
    elements.saveStatus.className = 'save-status saved';
    setTimeout(() => {
      elements.saveStatus.textContent = '';
      elements.saveStatus.className = 'save-status';
    }, 3000);
  } catch (error) {
    alert('批量标注失败: ' + error.message);
    elements.saveStatus.textContent = '批量标注失败';
    elements.saveStatus.className = 'save-status error';
    setTimeout(() => {
      elements.saveStatus.textContent = '';
      elements.saveStatus.className = 'save-status';
    }, 3000);
  } finally {
    elements.btnBatchLabel.disabled = false;
  }
}

function updateModelButtons() {
  const modelLoaded = modelManager.isModelLoaded();
  elements.btnAutoLabel.disabled = !modelLoaded || !fileManager.getCurrentImage();
  elements.btnBatchLabel.disabled = !modelLoaded || fileManager.images.length === 0;
}

// ========== 导出数据集 ==========

const exportState = {
  trainRatio: 80,
  valRatio: 10,
  testRatio: 10,
  exportDir: '',
  draggingHandle: null
};

function showExportModal() {
  if (state.hasUnsavedChanges) {
    saveCurrentLabels();
  }

  const stats = fileManager.getStats();
  elements.exportLabeledCount.textContent = stats.labeled;
  elements.exportUnlabeledCount.textContent = stats.unlabeled;

  exportState.trainRatio = 80;
  exportState.valRatio = 10;
  exportState.testRatio = 10;
  exportState.exportDir = '';
  elements.exportPathInput.value = '';
  elements.btnConfirmExport.disabled = true;

  updateSplitDisplay();
  elements.exportModal.classList.remove('hidden');
  shortcutManager.setEnabled(false);
}

function hideExportModal() {
  elements.exportModal.classList.add('hidden');
  shortcutManager.setEnabled(true);
}

async function selectExportDir() {
  const dir = await window.electronAPI.selectExportDir();
  if (dir) {
    exportState.exportDir = dir;
    elements.exportPathInput.value = dir;
    elements.btnConfirmExport.disabled = false;
  }
}

async function confirmExport() {
  if (!exportState.exportDir) return;

  const stats = fileManager.getStats();
  if (stats.labeled === 0) {
    alert('没有已标注的图片可导出');
    return;
  }

  elements.btnConfirmExport.disabled = true;
  elements.btnConfirmExport.textContent = '导出中...';

  const classNames = classManager.classes.map(c => c.name);

  const result = await window.electronAPI.splitDataset({
    sourceDir: fileManager.currentDir,
    exportDir: exportState.exportDir,
    ratios: {
      train: exportState.trainRatio / 100,
      val: exportState.valRatio / 100,
      test: exportState.testRatio / 100
    },
    classNames
  });

  elements.btnConfirmExport.textContent = '开始导出';

  if (result.success) {
    hideExportModal();
    await window.electronAPI.showConfirm({
      title: '导出完成',
      message: `数据集导出成功！\n\n共 ${result.stats.total} 张图片：\n  Train: ${result.stats.train} 张\n  Val: ${result.stats.val} 张\n  Test: ${result.stats.test} 张\n\n导出路径: ${exportState.exportDir}`,
      buttons: ['确定']
    });
  } else {
    elements.btnConfirmExport.disabled = false;
    alert(result.message);
  }
}

function updateSplitDisplay() {
  const { trainRatio, valRatio, testRatio } = exportState;

  elements.splitTrain.style.flex = trainRatio;
  elements.splitVal.style.flex = valRatio;
  elements.splitTest.style.flex = testRatio;

  elements.splitTrain.querySelector('.split-segment-label').style.display = trainRatio < 8 ? 'none' : '';
  elements.splitVal.querySelector('.split-segment-label').style.display = valRatio < 8 ? 'none' : '';
  elements.splitTest.querySelector('.split-segment-label').style.display = testRatio < 8 ? 'none' : '';

  elements.ratioTrainPct.textContent = `${trainRatio}%`;
  elements.ratioValPct.textContent = `${valRatio}%`;
  elements.ratioTestPct.textContent = `${testRatio}%`;

  const stats = fileManager.getStats();
  const total = stats.labeled;
  const trainCount = Math.round((total * trainRatio) / 100);
  const valCount = Math.round((total * valRatio) / 100);
  const testCount = total - trainCount - valCount;

  elements.ratioTrainCount.textContent = `${trainCount} 张`;
  elements.ratioValCount.textContent = `${valCount} 张`;
  elements.ratioTestCount.textContent = `${testCount} 张`;
}

function initSplitSlider() {
  const MIN_RATIO = 0;

  function onHandleMouseDown(e) {
    e.preventDefault();
    const handleId = parseInt(e.target.dataset.handle, 10);
    exportState.draggingHandle = handleId;
    e.target.classList.add('dragging');

    const onMouseMove = (moveEvent) => {
      moveEvent.preventDefault();
      const bar = elements.splitRatioBar;
      const barRect = bar.getBoundingClientRect();
      const handleWidth = 12;
      const usableWidth = barRect.width - handleWidth * 2;
      const relativeX = moveEvent.clientX - barRect.left - handleWidth;
      const pct = Math.max(0, Math.min(100, (relativeX / usableWidth) * 100));

      if (exportState.draggingHandle === 1) {
        let newTrain = Math.round(pct);
        newTrain = Math.max(MIN_RATIO, Math.min(100 - exportState.testRatio - MIN_RATIO, newTrain));
        const newVal = 100 - newTrain - exportState.testRatio;
        if (newVal >= MIN_RATIO) {
          exportState.trainRatio = newTrain;
          exportState.valRatio = newVal;
        }
      } else if (exportState.draggingHandle === 2) {
        let newTest = Math.round(100 - pct);
        newTest = Math.max(MIN_RATIO, Math.min(100 - exportState.trainRatio - MIN_RATIO, newTest));
        const newVal = 100 - exportState.trainRatio - newTest;
        if (newVal >= MIN_RATIO) {
          exportState.testRatio = newTest;
          exportState.valRatio = newVal;
        }
      }

      updateSplitDisplay();
    };

    const onMouseUp = () => {
      document.querySelectorAll('.split-handle').forEach(h => h.classList.remove('dragging'));
      exportState.draggingHandle = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  elements.splitHandle1.addEventListener('mousedown', onHandleMouseDown);
  elements.splitHandle2.addEventListener('mousedown', onHandleMouseDown);
}

// ========== 启动应用 ==========

init();
