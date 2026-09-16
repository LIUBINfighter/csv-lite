import { TextFileView, WorkspaceLeaf, Notice, TFile } from "obsidian";
import { EditorState, Extension, RangeSetBuilder, Compartment } from "@codemirror/state";
import { EditorView, keymap, placeholder, lineNumbers, drawSelection, Decoration, ViewPlugin, ViewUpdate, DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { CSVUtils } from "./utils/csv-utils";
import { replaceDoc } from "./utils/editor-newline";

export const VIEW_TYPE_CSV_SOURCE = "csv-lite-source-view";

// 用于热更新换行风格，避免 CodeMirror 把 CRLF 规范化成 LF（issue #52）
const lineSeparatorCompartment = new Compartment();

// 分隔符高亮插件（逗号、分号、制表符）
const separatorHighlightPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) {
    this.decorations = getSeparatorDecorations(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = getSeparatorDecorations(update.view);
    }
  }
}, {
  decorations: (v: any) => v.decorations as DecorationSet
});

function getSeparatorDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sepRegex = /[;,	]/g;
  for (let { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let match;
    while ((match = sepRegex.exec(text)) !== null) {
      const start = from + match.index;
      builder.add(start, start + 1, Decoration.mark({ class: "csv-separator-highlight" }));
    }
  }
  return builder.finish();
}

export class SourceView extends TextFileView {
  private editor: EditorView;
  public file: TFile | null;
  public headerEl: HTMLElement;
  // 文件原始换行风格（"\n" 或 "\r\n"）
  private originalNewline: string = "\n";
  // 是否有用户真实编辑（仅查看不写回）
  private dirty: boolean = false;
  // 抑制程序化变更（setViewData / clear）触发的保存
  private suppressSave: boolean = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.file = (this as any).file;
    this.headerEl = (this as any).headerEl;
  }

  getViewType(): string {
    return VIEW_TYPE_CSV_SOURCE;
  }

  getDisplayText(): string {
    return this.file ? `CSV source: ${this.file.basename}` : "CSV source";
  }

  getIcon(): string {
    // 使用 lucide 的 file-code 图标
    return "file-code";
  }

  async onOpen() {
    // 1. 在 view header 的 view-actions 区域插入切换按钮（lucide/table 图标）
    // 交互说明：
    // - 切换按钮始终位于 header 区域，风格与 Obsidian 原生一致。
    // - 点击时遍历所有 leaf，查找同一文件的目标视图（csv-lite-view）。
    //   - 若有，则激活该 leaf（workspace.setActiveLeaf）。
    //   - 若无，则新建 leaf 并打开目标视图。
    // - 不主动关闭原有视图，用户可自行关闭。
    const actionsEl = this.headerEl?.querySelector?.('.view-actions');
    if (actionsEl && !actionsEl.querySelector('.csv-switch-table')) {
      const btn = document.createElement('button');
      btn.className = 'clickable-icon csv-switch-table';
      btn.setAttribute('aria-label', '切换到表格模式');
      btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-table"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 21V3"/><path d="M15 21V3"/></svg>`;
      btn.onclick = async () => {
        const file = this.file;
        if (!file) return;
        const leaves = this.app.workspace.getLeavesOfType('csv-lite-view');
        let found = false;
        for (const leaf of leaves) {
          if (leaf.view && (leaf.view as any).file && (leaf.view as any).file.path === file.path) {
            this.app.workspace.setActiveLeaf(leaf, true, true);
            found = true;
            break;
          }
        }
        if (!found) {
          const newLeaf = this.app.workspace.getLeaf(true);
          await newLeaf.openFile(file, { active: true });
          await newLeaf.setViewState({
            type: 'csv-lite-view',
            active: true,
            state: { file: file.path }
          });
          this.app.workspace.setActiveLeaf(newLeaf, true, true);
        }
      };
      actionsEl.appendChild(btn);
    }

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    // 编辑器容器
    const editorContainer = container.createDiv({ cls: "csv-source-editor-container" });

    // 工具栏
    // 移除原有表格模式切换按钮（toolbar中的）
    // const buttonGroup = toolbar.createDiv({ cls: "csv-source-button-group" });
    // this.addToolbarButton(buttonGroup, "表格模式", "table", "切换到表格模式", ...);

    // CodeMirror 编辑器容器
    const cmContainer = editorContainer.createDiv({ cls: "csv-source-cm-container" });

    // 记录文件原始换行，避免 CodeMirror 把 CRLF 规范化成 LF（issue #52）
    this.originalNewline = CSVUtils.detectNewline(this.data || "");

    const extensions: Extension[] = [
      lineNumbers(),
      drawSelection(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      separatorHighlightPlugin,
      placeholder("输入 CSV 源码..."),
      EditorView.lineWrapping,
      // 让 state.sliceDoc()（getViewData）按原始换行序列化
      lineSeparatorCompartment.of(EditorState.lineSeparator.of(this.originalNewline)),
      EditorView.updateListener.of(update => {
        // setViewData / clear 造成的程序化变更不算用户编辑
        if (update.docChanged && !this.suppressSave) {
          this.dirty = true;
          this.requestSave();
        }
      })
    ];

    const state = EditorState.create({
      doc: this.data || "",
      extensions
    });

    this.editor = new EditorView({
      state,
      parent: cmContainer
    });

    this.addEditorStyles();
    setTimeout(() => this.editor.focus(), 10);
  }

  private addToolbarButton(container: HTMLElement, label: string, icon: string, tooltip: string, onClick: () => void) {
    const button = container.createEl("button", {
      text: label,
      cls: "csv-source-button",
      attr: { "aria-label": tooltip }
    });
    button.addEventListener("click", onClick);
  }

  private addEditorStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .csv-source-editor-container {
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .csv-source-toolbar {
        padding: 8px 12px;
        border-bottom: 1px solid var(--background-modifier-border);
        background: var(--background-secondary);
        font-weight: 500;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .csv-source-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-normal);
      }
      .csv-source-button-group {
        display: flex;
        gap: 4px;
      }
      .csv-source-button {
        background: var(--interactive-normal);
        color: var(--text-normal);
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.1s ease;
      }
      .csv-source-button:hover {
        background: var(--interactive-hover);
      }
      .csv-source-cm-container {
        flex: 1;
        overflow: auto;
        height: 100%;
      }
      .csv-source-cm-container .cm-editor {
        height: 100%;
      }
      .csv-source-cm-container .cm-scroller {
        font-family: var(--font-monospace);
        font-size: 14px;
        line-height: 1.5;
      }
      .csv-source-cm-container .cm-content {
        padding: 12px;
      }
      .cm-line .csv-separator-highlight {
        color: var(--color-accent);
        font-weight: bold;
        background: var(--background-modifier-active-hover);
        border-radius: 2px;
      }
      .csv-source-cm-container .cm-cursor {
        border-left: 2px solid var(--color-accent);
        /* 兼容明暗主题，使用主题主色 */
        background: none;
        opacity: 1;
        z-index: 10;
      }
      .csv-source-cm-container .cm-gutters {
        background: var(--background-secondary);
        color: var(--text-faint);
        border-right: 1px solid var(--background-modifier-border);
      }
      .csv-source-cm-container .cm-lineNumbers .cm-gutterElement {
        color: var(--text-faint);
      }
    `;
    document.head.appendChild(style);
    this.register(() => {
      document.head.removeChild(style);
    });
  }

  async onClose() {
    // 只是查看（没有任何编辑）就不写回，避免刷新 mtime / 触发同步（issue #52）
    if (this.dirty) {
      await this.save();
      this.dirty = false;
    }
  }

  getViewData(): string {
    // sliceDoc() 会按 state.lineBreak（lineSeparator facet）拼接，保留 CRLF；
    // doc.toString() 恒用 "\n"，会丢换行风格
    return this.editor ? this.editor.state.sliceDoc() : this.data || "";
  }

  setViewData(data: string, clear: boolean): void {
    // 每次加载都重新识别换行风格，并通过 compartment 热更新
    this.originalNewline = CSVUtils.detectNewline(data);
    this.suppressSave = true;
    try {
      if (clear) this.clear();
      this.data = data;
      if (this.editor) {
        // 先切 lineSeparator 再替换内容，否则 \r 会被当成内容 → \r\r\n
        // （详见 utils/editor-newline.ts 的说明）
        const nextState = replaceDoc(
          this.editor.state,
          lineSeparatorCompartment,
          data,
          this.originalNewline
        );
        this.editor.setState(nextState);
      }
    } finally {
      this.suppressSave = false;
    }
  }

  clear(): void {
    this.data = "";
    if (this.editor) {
      const prev = this.suppressSave;
      this.suppressSave = true;
      try {
        const transaction = this.editor.state.update({
          changes: { from: 0, to: this.editor.state.doc.length, insert: "" }
        });
        this.editor.dispatch(transaction);
      } finally {
        this.suppressSave = prev;
      }
    }
  }
}
