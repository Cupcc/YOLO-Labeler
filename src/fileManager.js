/**
 * 文件管理模块 - 处理图片加载和 YOLO 格式读写
 */
class FileManager {
  constructor() {
    this.currentDir = null;
    this.images = [];
    this.currentIndex = -1;
    
    // 回调函数
    this.onImagesLoaded = null;
    this.onImageChanged = null;
    this.onLabelsLoaded = null;
    this.onSaveStatusChanged = null;
    this.onFileListUpdated = null;  // 用于仅更新文件列表UI，不切换图片
  }
  
  // 打开目录
  async openDirectory() {
    const dirPath = await window.electronAPI.openDirectory();
    if (!dirPath) return null;
    
    this.currentDir = dirPath;
    this.images = await window.electronAPI.getImages(dirPath);
    this.currentIndex = this.images.length > 0 ? 0 : -1;
    
    if (this.onImagesLoaded) {
      this.onImagesLoaded(this.images, this.currentDir);
    }
    
    return this.currentDir;
  }
  
  // 获取当前图片
  getCurrentImage() {
    if (this.currentIndex >= 0 && this.currentIndex < this.images.length) {
      return this.images[this.currentIndex];
    }
    return null;
  }
  
  // 加载图片
  async loadImage(index) {
    if (index < 0 || index >= this.images.length) return null;
    
    this.currentIndex = index;
    const image = this.images[index];
    
    // 读取图片数据
    const imageData = await window.electronAPI.readImage(image.path);
    
    if (this.onImageChanged) {
      this.onImageChanged(image, index, imageData);
    }
    
    return imageData;
  }
  
  // 加载当前图片的标注
  async loadLabels() {
    const image = this.getCurrentImage();
    if (!image) return [];
    
    const content = await window.electronAPI.readLabels(image.path);
    if (!content) return [];
    
    const labels = this.parseYoloFormat(content);
    
    if (this.onLabelsLoaded) {
      this.onLabelsLoaded(labels);
    }
    
    return labels;
  }
  
  // 保存标注
  async saveLabels(annotations) {
    const image = this.getCurrentImage();
    if (!image) return false;
    
    if (this.onSaveStatusChanged) {
      this.onSaveStatusChanged('saving');
    }
    
    const content = this.toYoloFormat(annotations);
    const success = await window.electronAPI.saveLabels(image.path, content);
    
    if (this.onSaveStatusChanged) {
      this.onSaveStatusChanged(success ? 'saved' : 'error');
    }
    
    // 更新已标注状态
    if (success && annotations.length > 0) {
      this.images[this.currentIndex].hasLabels = true;
    } else if (success && annotations.length === 0) {
      this.images[this.currentIndex].hasLabels = false;
    }
    
    return success;
  }
  
  // 解析 YOLO 格式
  parseYoloFormat(content) {
    const lines = content.trim().split('\n');
    const labels = [];
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        labels.push({
          classId: parseInt(parts[0]),
          xCenter: parseFloat(parts[1]),
          yCenter: parseFloat(parts[2]),
          width: parseFloat(parts[3]),
          height: parseFloat(parts[4])
        });
      }
    }
    
    return labels;
  }
  
  // 转换为 YOLO 格式
  toYoloFormat(annotations) {
    return annotations.map(ann => {
      // 保留6位小数
      return `${ann.classId} ${ann.xCenter.toFixed(6)} ${ann.yCenter.toFixed(6)} ${ann.width.toFixed(6)} ${ann.height.toFixed(6)}`;
    }).join('\n');
  }
  
  // 下一张图片
  async nextImage() {
    if (this.currentIndex < this.images.length - 1) {
      return await this.loadImage(this.currentIndex + 1);
    }
    return null;
  }
  
  // 上一张图片
  async prevImage() {
    if (this.currentIndex > 0) {
      return await this.loadImage(this.currentIndex - 1);
    }
    return null;
  }
  
  // 跳转到指定图片
  async goToImage(index) {
    return await this.loadImage(index);
  }
  
  // 检查图片是否有标注
  async checkLabelsExist() {
    for (let i = 0; i < this.images.length; i++) {
      const labelContent = await window.electronAPI.readLabels(this.images[i].path);
      this.images[i].hasLabels = labelContent.trim().length > 0;
    }
    
    // 只更新文件列表UI，不触发切换图片
    if (this.onFileListUpdated) {
      this.onFileListUpdated(this.images);
    }
  }
  
  // 获取统计信息
  getStats() {
    const total = this.images.length;
    const labeled = this.images.filter(img => img.hasLabels).length;
    return { total, labeled, unlabeled: total - labeled };
  }
}
