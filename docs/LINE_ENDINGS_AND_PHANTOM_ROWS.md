# 换行风格丢失与「幽灵行」问题全记录

> 对应 issue：**#52 — "Screws up files only by viewing them"**
> 修复版本：**1.7.1**
> 相关代码：`src/utils/csv-utils.ts`、`src/view.ts`、`src/source-view.ts`、`src/utils/editor-newline.ts`

本文记录两个只靠「打开 / 查看」就会破坏 CSV 文件的问题：**结尾幽灵行** 与 **CRLF 被静默改成 LF**。前者在表格视图，后者在表格视图和源码视图都存在（源码视图还有第三个坑）。

---

## 1. 问题现象

用户报告：

- 仅仅打开查看文件，**CRLF 行尾就被换成 LF**。
- 文件结尾**不断多出空行**，每存一次就多一行。

实际观察到的损坏形态（`cat -A`）：

```
id,name,url,notes^M$      ← 正常：CRLF
1,...,Official site^M$
```

变成：

```
id,name,url,notes^M^M$    ← CR CR LF
1,...,Official site^M^M$
```

或者多出一行只有分隔符的「幽灵行」：

```
id,name,url
1,a,https://a.com
,,
```

---

## 2. 幽灵行是怎么来的

分三步，单独看每一步都"合理"，叠加起来就凭空造出了一行数据。

### 第 1 步：解析器把「结尾换行」当成「又开了一行」

CSV 文件通常以换行结束。人看是「N 行数据 + 一个结尾换行」，但 Papa Parse 在 `skipEmptyLines: false` 下会多返回一个空行 `[""]`：

```
原始文件 : "id,name,url\n1,a,https://a.com\n"
解析结果 : [["id","name","url"],["1","a","https://a.com"],[""]]   ← 多出来的 [""]
```

### 第 2 步：补列把「空行」变成「N 个空字段」

表格要画成矩形，`normalizeTableData()` 会把每行补齐到最大列数：

```
[""]  →  ["", "", ""]
```

**这一步是关键**：原本只是「一行空」，现在变成了「三个空字段」。

### 第 3 步：写回时「N 个空字段」= N-1 个分隔符

三个空字段在 CSV 里就是 `,,`，于是文件多出一行；而 `unparse` 也不会补结尾换行，所以原来的结尾换行还丢了：

```
补列之后 : [["id","name","url"],["1","a","https://a.com"],["","",""]]
再写回   : "id,name,url\n1,a,https://a.com\n,,"
```

4 列文件就会多出 `,,,`。**幽灵**的含义：它不在用户数据里，纯粹由「结尾换行 → 空行 → 补列 → 逗号行」这条链条凭空产生。

---

## 3. CRLF 被改成 LF 是怎么来的

### 表格视图

`CSVView.getViewData()` 保存时固定用 `"\n"` 序列化：

```ts
// 旧代码
return CSVUtils.unparseCSV(this.tableData, delim ? { delimiter: delim } : undefined);
// unparseCSV 内部默认 newline: "\n"
```

于是任何一次保存都会把 CRLF 文件写成 LF。

### 源码视图（还有第三个坑）

源码视图用 CodeMirror 渲染。CodeMirror 内部按 `\n` 存储，`doc.toString()` 默认也用 `\n` 拼回：

```ts
// 旧代码
getViewData() { return this.editor ? this.editor.state.doc.toString() : this.data; }
```

再加上旧代码**无条件保存**：

```ts
async onClose() { await this.save(); }                       // 关标签就写盘
EditorView.updateListener.of(u => { if (u.docChanged) this.save(); })  // 程序化 setViewData 也会触发
```

所以「切到源码视图看一眼再切回来」就足以把整个文件改写成 LF。

### 附带的 `\r\r\n` bug

修复过程中一度出现 `\r\r\n`（CR CR LF），根因是把「切换行分隔符」和「插入内容」放进同一个事务：

```ts
// 错误写法：同一事务
state.update({
  changes: { insert: data },                                    // 用「旧」的 lineBreak 切分
  effects: lineSeparatorCompartment.reconfigure(CRLF),           // 之后才改 lineBreak
});
```

CodeMirror 用**旧的** `lineBreak` 切分待插入文本，`\r` 被当成普通字符留在行尾，之后按 `\r\n` 序列化就变成 `\r\r\n`。

> 正确做法见 `src/utils/editor-newline.ts` 的 `replaceDoc()`：**先 reconfigure，再 insert**，分两个事务。

---

## 4. 修复方案

### 4.1 新增纯函数（`src/utils/csv-utils.ts`）

| 函数 | 作用 |
| --- | --- |
| `detectNewline(raw)` | 判断文件主要用 CRLF 还是 LF |
| `getTrailingNewline(raw)` | 取出结尾换行序列（`"\n"` / `"\n\n"` / `"\r\n"`）及其对应的幽灵行个数 |
| `dropTrailingRows(data, n)` | 精确剔除解析器多出来的 n 个空行（至少保留一行） |

### 4.2 表格视图（`src/view.ts`）

- `setViewData()`：记录 `originalFileNewline` 与 `originalTrailingNewline`，并在补列之前先 `dropTrailingRows()`；
- `getViewData()`：用原始换行符序列化，并在末尾原样补回结尾换行。

### 4.3 源码视图（`src/source-view.ts`）

- 用 `EditorState.lineSeparator` + `Compartment` 按检测到的换行风格配置 CodeMirror；
- `getViewData()` 改用 `state.sliceDoc()`（会按 `state.lineBreak` 拼接），不再用 `doc.toString()`；
- `setViewData()` / `clear()` 期间的**程序化变更**用 `suppressSave` 抑制保存；
- `onClose()` 只在 `dirty`（确实编辑过）时才写回 —— 纯查看零写入；
- `updateListener` 改用 `requestSave()`（debounce），不再每次按键同步写盘。

### 4.4 内容替换（`src/utils/editor-newline.ts`）

`replaceDoc()` 把「先切行分隔符、再替换内容」封装起来，避免第 3 节末尾的 `\r\r\n`。

---

## 5. 边界与注意点

- **真正的空记录不能被误删**。`x,y\n,\n` 里那一行 `,` 是**数据**（2 个空字段），而结尾换行造出的空行只有 1 个字段 `[""]`。所以修复按「结尾换行个数」精确剔除，而不是「删掉所有空行」。
- **无尾换行文件**保持无尾换行（`originalTrailingNewline` 为空，不补）。
- **混合换行**（同一文件既有 CRLF 又有 LF）按多数派决定，极端情况下仍会统一，属于已知取舍。
- **多列文件中间的空行**（如 `a,b\n\n1,2\n`）在保存时仍会被补列成 `,`。这是既有的列对齐行为，与结尾幽灵行无关，暂未处理。

---

## 6. 测试

- `test/line-endings.test.ts`（23 项）：CRLF/LF、有无结尾换行、多个空行、空文件、引号内多行字段、真实空记录等，均为**字节级 round-trip 相等**。
- `test/editor-newline.test.ts`（5 项）：含一条专门钉住「同一事务 reconfigure + insert 会产生 `\r\r\n`」的回归测试。

```bash
cd .obsidian/plugins/csv-lite
npx jest        # 7 suites / 69 tests
npm run build
```

---

## 7. 手动验证方法

1. 准备一个 **CRLF + 结尾换行** 的 CSV，记录 md5。
2. 在 Obsidian 里打开：
   - 表格视图改一个单元格并失焦保存；
   - 再切到源码视图改一次并保存；
   - 关掉源码视图标签。
3. 检查文件：
   - 仍为 CRLF，行数不变，结尾换行还在；
   - 没有 `,,,` 之类的幽灵行；
   - 只有你改的那一处内容有 diff；
   - 纯查看（不改）时 md5 **完全不变**。

> 相关但独立的问题：长链接单元格过高（issue #53）已通过 `.csv-cell-display` 单行截断 + 原生 tooltip 修复，详见 `styles.css` 与 `src/utils/url-utils.ts`。
