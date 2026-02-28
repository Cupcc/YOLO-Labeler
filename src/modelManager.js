/**
 * 模型管理模块 - 处理 YOLO 模型加载和推理
 */
class ModelManager {
  constructor() {
    this.modelPath = null;
    this.modelLoaded = false;
    this.modelClasses = [];
    
    // 回调函数
    this.onModelLoaded = null;
    this.onModelError = null;
    this.onInferenceProgress = null;
    
    // 监听 IPC 事件
    window.electronAPI.onModelLoaded((classes) => {
      this.modelClasses = classes;
      this.modelLoaded = true;
      if (this.onModelLoaded) {
        this.onModelLoaded(classes);
      }
    });
    
    window.electronAPI.onModelError((error) => {
      this.modelLoaded = false;
      if (this.onModelError) {
        this.onModelError(error);
      }
    });
  }
  
  // 加载模型
  async loadModel(modelPath) {
    if (!modelPath) {
      throw new Error('模型路径不能为空');
    }
    
    this.modelPath = modelPath;
    
    try {
      const result = await window.electronAPI.loadModel(modelPath);
      
      if (result.success) {
        this.modelClasses = result.classes || [];
        this.modelLoaded = true;
        // 保存模型路径
        await window.electronAPI.saveModelPath(modelPath);
        return this.modelClasses;
      } else {
        throw new Error(result.error || '模型加载失败');
      }
    } catch (error) {
      this.modelLoaded = false;
      throw error;
    }
  }
  
  // 对单张图片进行推理
  async detectImage(imagePath, confThreshold = 0.25) {
    if (!this.modelLoaded) {
      throw new Error('模型未加载');
    }
    
    try {
      const result = await window.electronAPI.detectImage(imagePath, confThreshold);
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error || '检测失败');
      }
    } catch (error) {
      throw error;
    }
  }
  
  // 获取模型类别
  getModelClasses() {
    return this.modelClasses;
  }
  
  // 检查模型是否已加载
  isModelLoaded() {
    return this.modelLoaded;
  }
  
  // 获取模型状态
  async getStatus() {
    const status = await window.electronAPI.getModelStatus();
    this.modelLoaded = status.loaded;
    this.modelClasses = status.classes || [];
    return status;
  }
  
  // 关闭模型
  async close() {
    await window.electronAPI.closeModel();
    this.modelLoaded = false;
    this.modelPath = null;
  }
}
