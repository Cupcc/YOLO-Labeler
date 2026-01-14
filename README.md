# YOLO Labeler

一个专业且高效的 YOLO 格式标注工具，基于 Electron 构建。专为计算机视觉开发者设计，提供流畅的交互体验和完善的功能支持。

![YOLO Labeler](https://img.shields.io/badge/Electron-28.0.0-47848F?style=flat-square&logo=electron)

![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## 核心特性

- **高效标注体验**：
  - 支持 **8个调整点** 的精细化框调整。
  - 支持 **鼠标滚轮缩放**（以鼠标为中心）和 **空格键平移** 画布。
  - 实时显示鼠标坐标和标注框尺寸。
- **智能管理**：
  - **自动保存**：所有修改在 500ms 内自动保存，防止数据丢失。
  - **标注状态预览**：文件列表中实时显示已标注/未标注状态。
  - **分类管理**：支持类别的添加、删除、重命名，并自动维护 `classes.txt`。
- **界面与主题**：
  - **深浅色主题适配**：跟随系统主题自动切换，提供专业的深色标注环境。
  - **自适应布局**：支持大图"适应窗口"（Fit to View）和原图显示。
- **标准 YOLO 格式**：
  - 直接读写归一化的 `.txt` 标注文件。
  - 精确到 6 位小数，确保标注精度。

## 快捷键参考

| 快捷键 | 功能 |
| :--- | :--- |
| `W` | 进入/退出创建标注模式 |
| `A` / `D` | 上一张 / 下一张图片 |
| `Delete` / `Backspace` | 删除选中标注框 |
| `Ctrl + S` | 手动保存当前标注 |
| `1` - `9` | 快速选择类别 |
| `Space` + `拖拽` | 平移画布 |
| `滚轮` | 缩放画布 (以鼠标为中心) |
| `Esc` | 取消当前操作 / 取消选中 |
| `右键点击` | 取消选中标注框 |

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 运行应用

```bash
# 标准启动
pnpm start

# 开发模式（开启开发者工具）
pnpm run dev
```

## 项目结构

```
labeling/
├── main.js               # Electron 主进程 (处理文件系统 IPC)
├── preload.js            # 预加载脚本 (安全桥接)
├── src/
│   ├── index.html        # 主界面布局
│   ├── styles.css        # UI 样式与主题适配
│   ├── renderer.js       # 渲染进程主逻辑 (模块调度)
│   ├── canvas.js         # 画布引擎 (处理绘制、缩放、变换)
│   ├── fileManager.js    # 文件系统管理器 (YOLO 格式读写)
│   ├── classManager.js   # 类别管理器 (管理 classes.txt)
│   └── shortcuts.js      # 全局快捷键管理器
└── package.json
```

## 文件规范

### 标注格式 (.txt)

每行代表一个目标，格式如下：
`<class_id> <x_center> <y_center> <width> <height>`
*(所有坐标均已归一化至 0-1 范围)*

### 类别定义 (classes.txt)

每行一个类别名称，索引从 0 开始。

## 许可证

MIT License
