
# CSV Lite

足够简单的 CSV 编辑器，无需学习和思考复杂的功能！

[English Version Readme](./README.md)

![test-sample](./asssets/test-sample.png)

> 如果你遇到任何问题，请下载 `test/test-sample.csv`，对比你的 CSV 文件和测试文件有何不同。提交带有截图的问题可以帮助我们更快地修复。

## 简介

保持专注！不要浪费时间创建花哨的表格。

一个旨在直接在 Obsidian 中查看和编辑 CSV 文件的插件。

## 为什么需要另一个 CSV 插件？

已经有很多 CSV 插件了，为什么还需要这个？

因为我希望它**简单至极**。

并且保持与**最新的 Obsidian API 和类型定义**同步。

没有花哨的功能，只有打开和编辑。

## 理念

- 没有花哨的 UI，对以下内容说不：
    - 模态框
    - 侧边栏
    - 设置选项卡
    - Readme
    - 在线文档和教程
    - 以上所有 UI 组件的功能都将在一个文件视图中实现。
- 一切都在 TextFileView/workspace 中进行。
- 不再污染你的库，除了`csv`文件本身，所有元数据都以 JSON 格式存储在 `./.obsidian/plugins/csv` 中。
- 每个功能必须在 3 个步骤内完成：
    1. 点击/热键
    2. 输入（如果需要）
    3. 确认
- 界面应保持最小化但功能齐全
- 用户无需离开其工作流程环境
- CSV 操作应像文本编辑一样自然。

## 功能

- 以表格格式查看 CSV 文件
- 在 Obsidian 中编辑 CSV 文件
- 支持标准 CSV 格式
- 兼容 Obsidian 的界面

## 目的

此插件通过允许用户在其库中无缝处理 CSV（逗号分隔值）文件，从而增强了 Obsidian 的功能，从而无需在不同的应用程序之间切换以进行 CSV 处理。

## 开始使用

通过 Obsidian 的社区插件部分安装插件，然后开始直接在你的笔记中查看 CSV 文件。

## 一些技术细节

### 撤销以及重做功能

在这个CSV插件中，操作的缓存主要存储在内存中，具体来说：

1. **历史记录缓存** - 存储在`CSVView`类的成员变量中：
   ```typescript
   private history: string[][][]; // 保存表格历史状态
   private currentHistoryIndex: number; // 当前历史状态索引
   ```
   这个缓存用于实现撤销/重做功能，保存了表格的每一个编辑状态。

2. **列宽缓存** - 也存储在类的成员变量中：
   ```typescript
   private columnWidths: number[] = [];
   ```

这些缓存都是临时存储在内存中的，当插件被卸载或Obsidian关闭时，这些数据会被清除。如果希望这些设置（如列宽）能够持久化保存，您需要修改代码，将这些数据通过插件的`saveData()`方法保存到Obsidian的配置文件中。

对于文件的实际内容（CSV数据）的保存，是通过`TextFileView`类提供的`requestSave()`方法实现的，它会将当前的`tableData`内容转换成文本并保存到磁盘上的原始CSV文件中。

如果您希望添加配置持久化功能，我可以帮您修改代码以实现这一点。
