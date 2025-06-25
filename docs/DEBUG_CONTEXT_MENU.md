# 右键菜单高亮功能调试指南

## 🎯 新增功能
现在当您右键点击行号或列号时，会自动高亮对应的行或列，并显示调试信息。

## 🔍 调试信息说明

### 1. 在浏览器开发者工具中查看控制台输出

#### 当设置菜单时，会看到：
```
[DEBUG] Header context menu setup completed
[DEBUG] TableEl: <table class="csv-table">...</table>
[DEBUG] 行号元素数量: N
[DEBUG] 列号元素数量: N
```

#### 当右键点击行号时，会看到：
```
[DEBUG] 右键事件触发 - 目标: <td class="csv-row-number">1</td> 类名: csv-row-number
[DEBUG] 右键点击行号: 1 目标元素: <td>... TR元素: <tr>...
[DEBUG] 已高亮行: 1
[HighlightManager] selectRow called with index: 1
[HighlightManager] clearSelection called
[HighlightManager] highlightRow called with index: 1
[HighlightManager] 找到的tbody行数: N
[HighlightManager] 高亮目标行: <tr>...
```

#### 当右键点击列号时，会看到：
```
[DEBUG] 右键事件触发 - 目标: <th class="csv-col-number">A</th> 类名: csv-col-number
[DEBUG] 右键点击列号: 0 目标元素: <th>... 所有列号元素: NodeList(N)
[DEBUG] 已高亮列: 0
[HighlightManager] selectColumn called with index: 0
[HighlightManager] clearSelection called
[HighlightManager] highlightColumn called with index: 0
[HighlightManager] 找到的列单元格数: N
[HighlightManager] 列单元格: NodeList(N)
```

#### 当菜单关闭时，会看到：
```
[HighlightManager] clearSelection called
[HighlightManager] clearHighlight called
[HighlightManager] 清除高亮元素数: N
[DEBUG] Header context menu closed
```

## 🧪 测试步骤

### 步骤1：测试基本右键功能
1. 在CSV文件视图中，右键点击任意行号（左边的数字）
2. 观察：
   - 该行是否高亮显示（背景色变化）
   - 是否弹出上下文菜单
   - 控制台是否输出相关调试信息

### 步骤2：测试列右键功能
1. 右键点击任意列号（顶部的字母）
2. 观察：
   - 该列是否高亮显示
   - 是否弹出上下文菜单
   - 控制台是否输出相关调试信息

### 步骤3：测试菜单操作
1. 右键点击行号，选择菜单中的任意操作（如"在上方插入行"）
2. 观察：
   - 菜单是否立即消失
   - 操作是否正确执行
   - 高亮是否正确清除
   - 新DOM是否正确绑定事件

### 步骤4：测试菜单关闭
1. 右键点击行号/列号打开菜单
2. 点击菜单外的其他地方
3. 观察菜单是否关闭，高亮是否清除

4. 重新打开菜单，按ESC键
5. 观察菜单是否关闭，高亮是否清除

## 🐛 常见问题诊断

### 问题1：右键没有反应
检查控制台是否有输出：
- 如果没有任何输出 → DOM事件绑定失败
- 如果有"右键事件触发"但没有后续 → 元素类名不匹配

### 问题2：菜单操作后不消失
检查控制台输出：
- 应该看到"Header context menu closed"
- 如果没有 → 菜单关闭逻辑有问题

### 问题3：高亮不显示
检查控制台输出：
- 如果看到"找到的tbody行数: 0" → DOM结构问题
- 如果看到"找到的列单元格数: 0" → CSS选择器问题

### 问题4：操作后右键失效
检查控制台输出：
- 应该先看到"Header context menu cleanup completed"
- 然后看到"Header context menu setup completed"
- 如果没有重新setup → 事件重绑定失败

## 🔧 调试技巧

1. **查看DOM结构**：在开发者工具中检查表格的HTML结构
2. **监控事件绑定**：查看控制台中的setup/cleanup日志
3. **检查CSS类名**：确认元素是否有正确的css-row-number/csv-col-number类
4. **验证高亮效果**：检查元素是否添加了csv-row-selected/csv-col-selected类

## 📝 调试清单

- [ ] 能看到setup完成的日志
- [ ] 右键行号有反应并输出正确日志
- [ ] 右键列号有反应并输出正确日志  
- [ ] 行高亮显示正常
- [ ] 列高亮显示正常
- [ ] 菜单项点击后菜单消失
- [ ] 操作执行后右键仍然有效
- [ ] ESC键能关闭菜单
- [ ] 点击外部能关闭菜单
- [ ] 菜单关闭时高亮清除

按照这个清单逐项测试，可以帮助我们快速定位问题所在！
