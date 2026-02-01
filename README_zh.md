# CSV Lite

足够简单的 CSV 编辑器，无需学习和思考复杂的功能！

[English Version Readme](./README.md)

[![DOI](https://zenodo.org/badge/953422745.svg)](https://doi.org/10.5281/zenodo.18447042) ![Obsidian Download](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=Downloads&query=$%5B%22csv-lite%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![Total Downloads](https://img.shields.io/github/downloads/LIUBINfighter/csv-lite/total?style=flat&label=Total%20Downloads) ![GitHub Issues](https://img.shields.io/github/issues/LIUBINfighter/csv-lite?style=flat&label=Issues) ![GitHub Last Commit](https://img.shields.io/github/last-commit/LIUBINfighter/csv-lite?style=flat&label=Last%20Commit)

<!-- ![test-sample](./asssets/test-sample.png) -->
<!-- ![v1.0.2 support searching](./asssets/searching.png) -->

![v1.1.0](./asssets/1.1.0-action-menu.png)

## 简介

保持专注！不要浪费时间创建花哨的表格。

一个旨在直接在 Obsidian 中查看和编辑 `CSV 文件` 的插件。

-   **查看** CSV 文件为整洁、可读的表格
-   **搜索** 整个文件，快速查找数据（按 `esc` 清除）
-   **导航** 轻松，带有编号的行和列
-   **固定** 通过小别针固定列，使其始终可见
-   **切换** 表格视图和原始源码模式
-   **编辑** 直接点击并输入即可编辑单元格
-   **管理** 行和列（添加、删除、移动），只需右键点击表头
- **非破坏性分隔符切换**：自动检测文件原始分隔符（逗号、分号、制表符等）。在工具栏切换分隔符只会重新解析视图，不会改写文件；保存编辑时仍使用文件原始分隔符，避免产生大规模 diff。
- **可点击的 URL 链接**：单元格中的纯文本 URL 和 Markdown 风格链接（`[文本](url)`）会自动识别并渲染为可点击的链接。点击链接在浏览器中打开，或点击编辑按钮（✎）编辑单元格内容。

我计划仅用 json 和 csv 设计自己的数据库。如果你有关于表格或 csv 的新想法，欢迎提 issue（我会考虑加入 csv-lite 或新插件），或在社区中搜索。<!-- 对于 Markdown 内编辑，推荐 `anyblock`，但语法更复杂。 -->

## 为什么需要另一个 CSV 插件？

已经有很多 CSV 插件了，为什么还要用这个？

因为它设计得足够简单直接，并且始终跟进最新的 Obsidian API 和类型定义。没有花哨功能——只需打开和编辑。

## 理念

- 没有花哨的 UI，拒绝以下内容：
        - 模态框
        - 侧边栏
        - 设置选项卡 <!-- - Readme. 实际上更新 readme 很重要，希望你不会注意到这一行 QAQ [#33](https://github.com/LIUBINfighter/csv-lite/issues/33) -->
        - 多余的在线文档和教程
- 上述所有 UI 组件的功能都将在单一文件视图中实现
- 一切都在 TextFileView/workspace 中完成
- 不再污染你的库，所有元数据都以 json 格式存储在 `./.obsidian/plugins/csv`（目前没有 `data.json`）
- 每个功能必须在 3 步内完成：
    0. 视觉定位
    1. 点击/快捷键
    2. 输入（如需）
    3. 确认/离开
- 界面应保持极简但实用
- 用户无需离开工作流环境
- CSV 操作应像文本编辑一样自然

## 目的

本插件增强了 Obsidian 的功能，让用户可以在库内无缝处理 CSV（逗号分隔值）文件，无需在不同应用间切换。

### 分隔符处理策略

多人协作或跨区域数据常混用不同分隔符（`,` `;` `\t`）。为降低风险：

1. 打开文件时自动检测分隔符。
2. 工具栏下拉（Auto, , ;）只是临时“重新解释”数据，不修改磁盘文件。
3. 你在表格中做的内容编辑（单元格/行列操作）保存时仍按最初检测出的原始分隔符写回。
4. 避免意外把所有分号文件改成逗号，减少版本库噪音。

如果需要真正“转换分隔符”的功能，欢迎提 issue，我们会加确认步骤而不是静默改写。

## 开始使用

通过 Obsidian 的社区插件区安装本插件，即可直接在笔记中查看和编辑 CSV 文件。

## 问题捕捉

你可以在[这里 issue](https://github.com/LIUBINfighter/csv-lite/issues/new).

> 如果你遇到任何和csv解析的问题，请下载 `test/test-sample.csv`，对比你的 CSV 文件和测试文件有何不同。提交带有截图的问题可以帮助我们更快地修复。
