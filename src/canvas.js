/**
 * 画布模块 - 处理标注绑定、缩放、拖拽
 */
class CanvasManager {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.wrapper = this.canvas.parentElement;
    
    // 图片状态
    this.image = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    
    // 视图状态
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.minScale = 0.1;
    this.maxScale = 10;
    
    // 绘制状态
    this.isDrawing = false;
    this.isDragging = false;
    this.isResizing = false;
    this.isPanning = false;
    this.spacePressed = false;
    this.drawMode = false;
    
    // 当前绘制的矩形
    this.startX = 0;
    this.startY = 0;
    this.currentRect = null;
    
    // 标注数据
    this.annotations = [];
    this.selectedIndex = -1;
    this.hoveredIndex = -1;
    
    // 撤销功能 - 历史记录栈
    this.history = [];
    this.maxHistorySize = 50;
    
    // 调整大小相关
    this.resizeHandle = null;
    this.handleSize = 8;
    
    // 回调函数
    this.onAnnotationCreated = null;
    this.onAnnotationSelected = null;
    this.onAnnotationDeleted = null;
    this.onAnnotationsChanged = null;
    this.onMouseMove = null;
    this.onZoomChanged = null;
    
    // 类别颜色
    this.classColors = [];
    
    this.init();
  }
  
  init() {
    this.bindEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  
  bindEvents() {
    // 鼠标事件
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // 键盘事件（空格键平移）
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.spacePressed) {
        this.spacePressed = true;
        this.canvas.style.cursor = 'grab';
      }
    });
    
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        this.updateCursor();
      }
    });
  }
  
  resize() {
    const rect = this.wrapper.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    // 窗口大小变化时，自动居中图片（保持当前缩放比例）
    if (this.image) {
      this.centerImage();
    }
    
    this.render();
    this.notifyZoomChange();
  }
  
  // 加载图片
  loadImage(src, keepZoom = true) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // 保存当前的缩放比例
        const previousScale = this.scale;
        const isFirstImage = !this.image;
        
        this.image = img;
        this.imageWidth = img.width;
        this.imageHeight = img.height;
        this.annotations = [];
        this.selectedIndex = -1;
        
        if (keepZoom && !isFirstImage) {
          // 保持之前的缩放比例，只重新居中
          this.scale = previousScale;
          this.centerImage();
          this.render();
          this.notifyZoomChange();
        } else {
          // 首次加载或不保持缩放时，使用100%缩放并居中
          this.resetZoom();
        }
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }
  
  // 适应视图
  fitToView() {
    if (!this.image) return;
    
    const padding = 40;
    const availableWidth = this.canvas.width - padding * 2;
    const availableHeight = this.canvas.height - padding * 2;
    
    const scaleX = availableWidth / this.imageWidth;
    const scaleY = availableHeight / this.imageHeight;
    this.scale = Math.min(scaleX, scaleY, 1);
    
    // 居中
    this.centerImage();
    this.notifyZoomChange();
  }
  
  // 设置100%缩放并居中
  resetZoom() {
    if (!this.image) return;
    
    this.scale = 1;
    this.centerImage();
    this.render();
    this.notifyZoomChange();
  }
  
  // 居中图片（不改变缩放比例）
  centerImage() {
    if (!this.image) return;
    
    this.offsetX = (this.canvas.width - this.imageWidth * this.scale) / 2;
    this.offsetY = (this.canvas.height - this.imageHeight * this.scale) / 2;
  }
  
  // 通知缩放变化
  notifyZoomChange() {
    if (this.onZoomChanged) {
      this.onZoomChanged(this.getZoomPercent());
    }
  }
  
  // 设置缩放
  setZoom(newScale, centerX, centerY) {
    newScale = Math.max(this.minScale, Math.min(this.maxScale, newScale));
    
    if (centerX === undefined) centerX = this.canvas.width / 2;
    if (centerY === undefined) centerY = this.canvas.height / 2;
    
    // 保持缩放中心点
    const imgX = (centerX - this.offsetX) / this.scale;
    const imgY = (centerY - this.offsetY) / this.scale;
    
    this.scale = newScale;
    
    this.offsetX = centerX - imgX * this.scale;
    this.offsetY = centerY - imgY * this.scale;
    
    this.render();
    this.notifyZoomChange();
  }
  
  zoomIn() {
    this.setZoom(this.scale * 1.2);
  }
  
  zoomOut() {
    this.setZoom(this.scale / 1.2);
  }
  
  getZoomPercent() {
    return Math.round(this.scale * 100);
  }
  
  // 坐标转换：屏幕 -> 图片
  screenToImage(x, y) {
    return {
      x: (x - this.offsetX) / this.scale,
      y: (y - this.offsetY) / this.scale
    };
  }
  
  // 坐标转换：图片 -> 屏幕
  imageToScreen(x, y) {
    return {
      x: x * this.scale + this.offsetX,
      y: y * this.scale + this.offsetY
    };
  }
  
  // 处理鼠标按下
  handleMouseDown(e) {
    if (!this.image) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const imgPos = this.screenToImage(x, y);
    
    // 空格键 + 拖拽 = 平移
    if (this.spacePressed || e.button === 1) {
      this.isPanning = true;
      this.panStartX = x;
      this.panStartY = y;
      this.panOffsetX = this.offsetX;
      this.panOffsetY = this.offsetY;
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    
    // 右键点击取消选择
    if (e.button === 2) {
      this.selectedIndex = -1;
      this.drawMode = false;
      this.render();
      if (this.onAnnotationSelected) {
        this.onAnnotationSelected(-1);
      }
      return;
    }
    
    // 检查是否点击了调整手柄
    if (this.selectedIndex >= 0) {
      const handle = this.getResizeHandle(x, y);
      if (handle) {
        this.saveHistory(); // 保存历史
        this.isResizing = true;
        this.resizeHandle = handle;
        this.resizeStartRect = { ...this.annotations[this.selectedIndex] };
        return;
      }
    }
    
    // 检查是否点击了现有标注
    const clickedIndex = this.getAnnotationAtPoint(imgPos.x, imgPos.y);
    
    if (clickedIndex >= 0 && !this.drawMode) {
      // 选中现有标注
      this.saveHistory(); // 保存历史（用于拖拽）
      this.selectedIndex = clickedIndex;
      this.isDragging = true;
      this.dragStartX = imgPos.x;
      this.dragStartY = imgPos.y;
      this.dragStartRect = { ...this.annotations[clickedIndex] };
      this.render();
      if (this.onAnnotationSelected) {
        this.onAnnotationSelected(clickedIndex);
      }
    } else if (this.drawMode) {
      // 开始绘制新矩形
      this.isDrawing = true;
      this.startX = Math.max(0, Math.min(this.imageWidth, imgPos.x));
      this.startY = Math.max(0, Math.min(this.imageHeight, imgPos.y));
      this.currentRect = null;
    } else {
      // 取消选择
      this.selectedIndex = -1;
      this.render();
      if (this.onAnnotationSelected) {
        this.onAnnotationSelected(-1);
      }
    }
  }
  
  // 处理鼠标移动
  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const imgPos = this.screenToImage(x, y);
    
    // 通知坐标变化
    if (this.onMouseMove) {
      this.onMouseMove(
        Math.round(imgPos.x),
        Math.round(imgPos.y),
        this.currentRect
      );
    }
    
    // 平移画布
    if (this.isPanning) {
      this.offsetX = this.panOffsetX + (x - this.panStartX);
      this.offsetY = this.panOffsetY + (y - this.panStartY);
      this.render();
      return;
    }
    
    // 调整标注大小
    if (this.isResizing && this.selectedIndex >= 0) {
      this.resizeAnnotation(imgPos.x, imgPos.y);
      this.render();
      return;
    }
    
    // 拖拽标注
    if (this.isDragging && this.selectedIndex >= 0) {
      const dx = imgPos.x - this.dragStartX;
      const dy = imgPos.y - this.dragStartY;
      
      const ann = this.annotations[this.selectedIndex];
      ann.x = Math.max(0, Math.min(this.imageWidth - ann.width, this.dragStartRect.x + dx));
      ann.y = Math.max(0, Math.min(this.imageHeight - ann.height, this.dragStartRect.y + dy));
      
      this.render();
      return;
    }
    
    // 绘制矩形
    if (this.isDrawing) {
      const endX = Math.max(0, Math.min(this.imageWidth, imgPos.x));
      const endY = Math.max(0, Math.min(this.imageHeight, imgPos.y));
      
      this.currentRect = {
        x: Math.min(this.startX, endX),
        y: Math.min(this.startY, endY),
        width: Math.abs(endX - this.startX),
        height: Math.abs(endY - this.startY)
      };
      
      this.render();
      return;
    }
    
    // 更新光标和悬停状态
    this.updateCursor(x, y, imgPos);
  }
  
  // 处理鼠标释放
  handleMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.updateCursor();
      return;
    }
    
    if (this.isResizing) {
      this.isResizing = false;
      this.resizeHandle = null;
      if (this.onAnnotationsChanged) {
        this.onAnnotationsChanged();
      }
      return;
    }
    
    if (this.isDragging) {
      this.isDragging = false;
      if (this.onAnnotationsChanged) {
        this.onAnnotationsChanged();
      }
      return;
    }
    
    if (this.isDrawing && this.currentRect) {
      this.isDrawing = false;
      
      // 检查矩形是否足够大
      if (this.currentRect.width > 5 && this.currentRect.height > 5) {
        // 通知创建标注
        if (this.onAnnotationCreated) {
          this.onAnnotationCreated(this.currentRect);
        }
      }
      
      this.currentRect = null;
      this.drawMode = false;
      this.render();
    }
  }
  
  handleMouseLeave(e) {
    if (this.isDrawing) {
      this.isDrawing = false;
      this.currentRect = null;
      this.render();
    }
  }
  
  // 处理滚轮缩放（仅在按住Ctrl键时生效）
  handleWheel(e) {
    if (!this.image) return;
    
    // 只有按住Ctrl键时才缩放
    if (!e.ctrlKey) return;
    
    e.preventDefault();
    
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.setZoom(this.scale * delta, x, y);
  }
  
  // 更新光标
  updateCursor(x, y, imgPos) {
    if (this.spacePressed) {
      this.canvas.style.cursor = 'grab';
      return;
    }
    
    if (this.drawMode) {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    
    if (x !== undefined && y !== undefined && this.selectedIndex >= 0) {
      const handle = this.getResizeHandle(x, y);
      if (handle) {
        const cursors = {
          'nw': 'nw-resize', 'ne': 'ne-resize',
          'sw': 'sw-resize', 'se': 'se-resize',
          'n': 'n-resize', 's': 's-resize',
          'w': 'w-resize', 'e': 'e-resize'
        };
        this.canvas.style.cursor = cursors[handle] || 'default';
        return;
      }
    }
    
    if (imgPos && this.getAnnotationAtPoint(imgPos.x, imgPos.y) >= 0) {
      this.canvas.style.cursor = 'move';
      return;
    }
    
    this.canvas.style.cursor = 'default';
  }
  
  // 获取点击位置的标注索引
  getAnnotationAtPoint(x, y) {
    for (let i = this.annotations.length - 1; i >= 0; i--) {
      const ann = this.annotations[i];
      if (x >= ann.x && x <= ann.x + ann.width &&
          y >= ann.y && y <= ann.y + ann.height) {
        return i;
      }
    }
    return -1;
  }
  
  // 获取调整手柄
  getResizeHandle(screenX, screenY) {
    if (this.selectedIndex < 0) return null;
    
    const ann = this.annotations[this.selectedIndex];
    const handles = this.getHandlePositions(ann);
    const threshold = this.handleSize + 4;
    
    for (const [name, pos] of Object.entries(handles)) {
      const screen = this.imageToScreen(pos.x, pos.y);
      if (Math.abs(screenX - screen.x) < threshold &&
          Math.abs(screenY - screen.y) < threshold) {
        return name;
      }
    }
    return null;
  }
  
  // 获取手柄位置
  getHandlePositions(ann) {
    return {
      'nw': { x: ann.x, y: ann.y },
      'ne': { x: ann.x + ann.width, y: ann.y },
      'sw': { x: ann.x, y: ann.y + ann.height },
      'se': { x: ann.x + ann.width, y: ann.y + ann.height },
      'n': { x: ann.x + ann.width / 2, y: ann.y },
      's': { x: ann.x + ann.width / 2, y: ann.y + ann.height },
      'w': { x: ann.x, y: ann.y + ann.height / 2 },
      'e': { x: ann.x + ann.width, y: ann.y + ann.height / 2 }
    };
  }
  
  // 调整标注大小
  resizeAnnotation(imgX, imgY) {
    const ann = this.annotations[this.selectedIndex];
    const start = this.resizeStartRect;
    
    imgX = Math.max(0, Math.min(this.imageWidth, imgX));
    imgY = Math.max(0, Math.min(this.imageHeight, imgY));
    
    switch (this.resizeHandle) {
      case 'nw':
        ann.width = start.x + start.width - imgX;
        ann.height = start.y + start.height - imgY;
        ann.x = imgX;
        ann.y = imgY;
        break;
      case 'ne':
        ann.width = imgX - start.x;
        ann.height = start.y + start.height - imgY;
        ann.y = imgY;
        break;
      case 'sw':
        ann.width = start.x + start.width - imgX;
        ann.height = imgY - start.y;
        ann.x = imgX;
        break;
      case 'se':
        ann.width = imgX - start.x;
        ann.height = imgY - start.y;
        break;
      case 'n':
        ann.height = start.y + start.height - imgY;
        ann.y = imgY;
        break;
      case 's':
        ann.height = imgY - start.y;
        break;
      case 'w':
        ann.width = start.x + start.width - imgX;
        ann.x = imgX;
        break;
      case 'e':
        ann.width = imgX - start.x;
        break;
    }
    
    // 确保宽高为正
    if (ann.width < 0) {
      ann.x += ann.width;
      ann.width = -ann.width;
    }
    if (ann.height < 0) {
      ann.y += ann.height;
      ann.height = -ann.height;
    }
    
    // 最小尺寸
    ann.width = Math.max(5, ann.width);
    ann.height = Math.max(5, ann.height);
  }
  
  // 设置标注数据
  setAnnotations(annotations) {
    this.annotations = annotations;
    this.selectedIndex = -1;
    this.history = []; // 重置历史记录
    this.render();
  }
  
  // 保存当前状态到历史记录
  saveHistory() {
    // 深拷贝当前标注数据
    const state = {
      annotations: JSON.parse(JSON.stringify(this.annotations)),
      selectedIndex: this.selectedIndex
    };
    
    this.history.push(state);
    
    // 限制历史记录大小
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
  
  // 撤销操作
  undo() {
    if (this.history.length === 0) {
      return false;
    }
    
    const state = this.history.pop();
    this.annotations = state.annotations;
    this.selectedIndex = state.selectedIndex;
    this.render();
    
    if (this.onAnnotationsChanged) {
      this.onAnnotationsChanged();
    }
    
    if (this.onAnnotationSelected) {
      this.onAnnotationSelected(this.selectedIndex);
    }
    
    return true;
  }
  
  // 检查是否可以撤销
  canUndo() {
    return this.history.length > 0;
  }
  
  // 添加标注
  addAnnotation(annotation) {
    this.saveHistory(); // 保存历史
    this.annotations.push(annotation);
    this.selectedIndex = this.annotations.length - 1;
    this.render();
    if (this.onAnnotationsChanged) {
      this.onAnnotationsChanged();
    }
  }
  
  // 删除选中标注
  deleteSelected() {
    if (this.selectedIndex >= 0) {
      this.saveHistory(); // 保存历史
      const deleted = this.annotations.splice(this.selectedIndex, 1)[0];
      this.selectedIndex = -1;
      this.render();
      if (this.onAnnotationDeleted) {
        this.onAnnotationDeleted(deleted);
      }
      if (this.onAnnotationsChanged) {
        this.onAnnotationsChanged();
      }
      return true;
    }
    return false;
  }
  
  // 删除指定索引的标注
  deleteAnnotation(index) {
    if (index >= 0 && index < this.annotations.length) {
      this.saveHistory(); // 保存历史
      this.annotations.splice(index, 1);
      if (this.selectedIndex === index) {
        this.selectedIndex = -1;
      } else if (this.selectedIndex > index) {
        this.selectedIndex--;
      }
      this.render();
      if (this.onAnnotationsChanged) {
        this.onAnnotationsChanged();
      }
    }
  }
  
  // 选择标注
  selectAnnotation(index) {
    this.selectedIndex = index;
    this.render();
  }
  
  // 设置绘制模式
  setDrawMode(enabled) {
    this.drawMode = enabled;
    this.updateCursor();
  }
  
  // 设置类别颜色
  setClassColors(colors) {
    this.classColors = colors;
    this.render();
  }
  
  // 获取类别颜色
  getClassColor(classId) {
    if (classId >= 0 && classId < this.classColors.length) {
      return this.classColors[classId];
    }
    // 默认颜色
    const hue = (classId * 137.5) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }
  
  // 将颜色转换为带透明度的 RGBA
  colorToRgba(color, alpha = 0.2) {
    // 创建一个临时 canvas 来解析颜色
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 1;
    tempCanvas.height = 1;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = color;
    tempCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = tempCtx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  // 渲染
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    if (!this.image) return;
    
    // 绘制图片
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    ctx.drawImage(this.image, 0, 0);
    
    // 绘制已有标注
    this.annotations.forEach((ann, index) => {
      const isSelected = index === this.selectedIndex;
      const color = this.getClassColor(ann.classId);
      
      // 先绘制半透明填充背景（内部浅色）
      const fillAlpha = isSelected ? 0.25 : 0.15;
      ctx.fillStyle = this.colorToRgba(color, fillAlpha);
      ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
      
      // 再绘制边框（实心颜色）
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 / this.scale : 2 / this.scale;
      ctx.strokeRect(ann.x, ann.y, ann.width, ann.height);
      
      // 绘制类别标签（无背景，避免遮挡目标）
      const labelHeight = 18 / this.scale;
      const fontSize = 12 / this.scale;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textBaseline = 'middle';
      const label = (ann.className && ann.className.includes(':')) 
        ? ann.className 
        : `${ann.classId}:${ann.className || `Class ${ann.classId}`}`;
      ctx.fillText(label, ann.x + 4 / this.scale, ann.y - labelHeight / 2, ann.width - 8 / this.scale);
      
      // 绘制选中状态的调整手柄
      if (isSelected) {
        const handles = this.getHandlePositions(ann);
        const handleSize = this.handleSize / this.scale;
        
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 / this.scale;
        
        Object.values(handles).forEach(pos => {
          ctx.fillRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(pos.x - handleSize / 2, pos.y - handleSize / 2, handleSize, handleSize);
        });
      }
    });
    
    // 绘制当前正在创建的矩形
    if (this.currentRect) {
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2 / this.scale;
      ctx.setLineDash([5 / this.scale, 5 / this.scale]);
      ctx.strokeRect(
        this.currentRect.x,
        this.currentRect.y,
        this.currentRect.width,
        this.currentRect.height
      );
      ctx.setLineDash([]);
      
      ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.fillRect(
        this.currentRect.x,
        this.currentRect.y,
        this.currentRect.width,
        this.currentRect.height
      );
    }
    
    ctx.restore();
  }
  
  // 清除画布
  clear() {
    this.image = null;
    this.annotations = [];
    this.selectedIndex = -1;
    this.currentRect = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  // 获取 YOLO 格式标注
  getYoloAnnotations() {
    if (!this.image) return [];
    
    return this.annotations.map(ann => ({
      classId: ann.classId,
      xCenter: (ann.x + ann.width / 2) / this.imageWidth,
      yCenter: (ann.y + ann.height / 2) / this.imageHeight,
      width: ann.width / this.imageWidth,
      height: ann.height / this.imageHeight
    }));
  }
  
  // 从 YOLO 格式加载标注
  loadYoloAnnotations(yoloData, classNames) {
    if (!this.image) return;
    
    this.annotations = yoloData.map(item => {
      const width = item.width * this.imageWidth;
      const height = item.height * this.imageHeight;
      return {
        classId: item.classId,
        className: classNames[item.classId] || `Class ${item.classId}`,
        x: item.xCenter * this.imageWidth - width / 2,
        y: item.yCenter * this.imageHeight - height / 2,
        width: width,
        height: height
      };
    });
    
    this.selectedIndex = -1;
    this.render();
  }
}
