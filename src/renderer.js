/**
 * 主渲染进程 - 整合所有模块
 */

// 初始化模块
const canvas = new CanvasManager('main-canvas');
const fileManager = new FileManager();
const classManager = new ClassManager();

// DOM 元素
const elements = {
  // 工具栏
  btnOpenDir: document.getElementById('btn-open-dir'),
  btnSave: document.getElementById('btn-save'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
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
  addClassModalClose: document.getElementById('add-class-modal-close')
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
  elements.addClassModal.addEventListener('click', (e) => {
    if (e.target === elements.addClassModal) hideAddClassModal();
  });
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

// ========== 启动应用 ==========

init();
