/**
 * 类别管理模块 - 处理 classes.txt 的加载、保存和编辑
 */
class ClassManager {
  constructor() {
    this.classes = [];
    this.currentDir = null;
    this.selectedClassId = 0;
    
    // 预定义颜色调色板
    this.colorPalette = [
      '#ef4444', // 红
      '#f97316', // 橙
      '#eab308', // 黄
      '#22c55e', // 绿
      '#06b6d4', // 青
      '#3b82f6', // 蓝
      '#8b5cf6', // 紫
      '#ec4899', // 粉
      '#14b8a6', // 蓝绿
      '#f59e0b', // 琥珀
      '#84cc16', // 酸橙
      '#6366f1', // 靛蓝
      '#a855f7', // 紫罗兰
      '#f43f5e', // 玫瑰
      '#0ea5e9', // 天蓝
      '#10b981', // 翠绿
    ];
    
    // 回调函数
    this.onClassesChanged = null;
    this.onClassSelected = null;
  }
  
  // 加载类别
  async loadClasses(dirPath) {
    this.currentDir = dirPath;
    const classNames = await window.electronAPI.readClasses(dirPath);
    
    this.classes = classNames.map((name, index) => ({
      id: index,
      name: name.trim(),
      color: this.getColor(index)
    }));
    
    // 如果没有类别，添加默认类别
    if (this.classes.length === 0) {
      this.classes.push({
        id: 0,
        name: 'object',
        color: this.getColor(0)
      });
      await this.saveClasses();
    }
    
    this.selectedClassId = 0;
    
    if (this.onClassesChanged) {
      this.onClassesChanged(this.classes);
    }
    
    return this.classes;
  }
  
  // 保存类别
  async saveClasses() {
    if (!this.currentDir) return false;
    
    const classNames = this.classes.map(c => c.name);
    return await window.electronAPI.saveClasses(this.currentDir, classNames);
  }
  
  // 添加类别
  async addClass(name) {
    name = name.trim();
    if (!name) return null;
    
    // 检查是否已存在
    if (this.classes.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      return null;
    }
    
    const newClass = {
      id: this.classes.length,
      name: name,
      color: this.getColor(this.classes.length)
    };
    
    this.classes.push(newClass);
    await this.saveClasses();
    
    if (this.onClassesChanged) {
      this.onClassesChanged(this.classes);
    }
    
    return newClass;
  }
  
  // 删除类别
  async deleteClass(id) {
    if (this.classes.length <= 1) {
      // 至少保留一个类别
      return false;
    }
    
    const index = this.classes.findIndex(c => c.id === id);
    if (index === -1) return false;
    
    this.classes.splice(index, 1);
    
    // 重新分配 ID
    this.classes.forEach((c, i) => {
      c.id = i;
      c.color = this.getColor(i);
    });
    
    // 更新选中的类别
    if (this.selectedClassId >= this.classes.length) {
      this.selectedClassId = this.classes.length - 1;
    }
    
    await this.saveClasses();
    
    if (this.onClassesChanged) {
      this.onClassesChanged(this.classes);
    }
    
    return true;
  }
  
  // 重命名类别
  async renameClass(id, newName) {
    newName = newName.trim();
    if (!newName) return false;
    
    const classItem = this.classes.find(c => c.id === id);
    if (!classItem) return false;
    
    // 检查是否与其他类别重名
    if (this.classes.some(c => c.id !== id && c.name.toLowerCase() === newName.toLowerCase())) {
      return false;
    }
    
    classItem.name = newName;
    await this.saveClasses();
    
    if (this.onClassesChanged) {
      this.onClassesChanged(this.classes);
    }
    
    return true;
  }
  
  // 选择类别
  selectClass(id) {
    if (id >= 0 && id < this.classes.length) {
      this.selectedClassId = id;
      if (this.onClassSelected) {
        this.onClassSelected(id, this.classes[id]);
      }
    }
  }
  
  // 获取当前选中的类别
  getSelectedClass() {
    return this.classes[this.selectedClassId] || null;
  }
  
  // 获取类别名称
  getClassName(id) {
    const classItem = this.classes.find(c => c.id === id);
    const name = classItem ? classItem.name : `Class ${id}`;
    return `${id}:${name}`;
  }
  
  // 获取类别颜色
  getColor(id) {
    return this.colorPalette[id % this.colorPalette.length];
  }
  
  // 获取所有类别颜色
  getAllColors() {
    return this.classes.map(c => c.color);
  }
  
  // 获取类别数量
  getCount() {
    return this.classes.length;
  }
  
  // 通过快捷键选择类别 (1-9)
  selectByShortcut(key) {
    const num = parseInt(key);
    if (num >= 1 && num <= 9) {
      const id = num - 1;
      if (id < this.classes.length) {
        this.selectClass(id);
        return true;
      }
    }
    return false;
  }
}
