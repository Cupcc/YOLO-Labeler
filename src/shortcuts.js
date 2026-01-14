/**
 * 快捷键模块 - 处理键盘快捷键
 */
class ShortcutManager {
  constructor() {
    this.shortcuts = new Map();
    this.enabled = true;
    this.init();
  }
  
  init() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }
  
  handleKeyDown(e) {
    if (!this.enabled) return;
    
    // 如果焦点在输入框内，不处理快捷键
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    
    const key = this.getKeyString(e);
    const handler = this.shortcuts.get(key);
    
    if (handler) {
      e.preventDefault();
      handler(e);
    }
  }
  
  getKeyString(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    
    // 处理特殊键
    let keyName = e.key.toLowerCase();
    if (keyName === ' ') keyName = 'space';
    if (keyName === 'escape') keyName = 'esc';
    if (keyName === 'delete') keyName = 'del';
    if (keyName === 'arrowleft') keyName = 'left';
    if (keyName === 'arrowright') keyName = 'right';
    if (keyName === 'arrowup') keyName = 'up';
    if (keyName === 'arrowdown') keyName = 'down';
    
    parts.push(keyName);
    return parts.join('+');
  }
  
  // 注册快捷键
  register(key, handler) {
    this.shortcuts.set(key.toLowerCase(), handler);
  }
  
  // 注销快捷键
  unregister(key) {
    this.shortcuts.delete(key.toLowerCase());
  }
  
  // 注册多个快捷键
  registerAll(shortcuts) {
    for (const [key, handler] of Object.entries(shortcuts)) {
      this.register(key, handler);
    }
  }
  
  // 启用/禁用快捷键
  setEnabled(enabled) {
    this.enabled = enabled;
  }
  
  // 清除所有快捷键
  clear() {
    this.shortcuts.clear();
  }
}

// 创建全局实例
const shortcutManager = new ShortcutManager();
