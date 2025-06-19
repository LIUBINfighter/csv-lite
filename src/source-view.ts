import { TextFileView, WorkspaceLeaf, Notice } from "obsidian";
import { EditorState, Extension, RangeSetBuilder } from "@codemirror/state";
import { EditorView, keymap, placeholder, lineNumbers, drawSelection, Decoration, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";

export const VIEW_TYPE_CSV_SOURCE = "csv-source-view";

// 分隔符高亮插件（逗号、分号、制表符）
const separatorHighlightPlugin = ViewPlugin.fromClass(class {
  decorations;
  constructor(view) {
    this.decorations = getSeparatorDecorations(view);
  }
  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = getSeparatorDecorations(update.view);
    }
  }
}, {
  decorations: v => v.decorations
});

function getSeparatorDecorations(view) {
  const builder = new RangeSetBuilder();
  const sepRegex = /[;,\t]/g;
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

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_CSV_SOURCE;
  }

  getDisplayText(): string {
    return this.file ? `CSV 源码模式: ${this.file.basename}` : "CSV 源码模式";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();

    // 编辑器容器
    const editorContainer = container.createDiv({ cls: "csv-source-editor-container" });

    // 工具栏
    const toolbar = editorContainer.createDiv({ cls: "csv-source-toolbar" });
    toolbar.createEl("span", { text: "CSV 源码编辑器", cls: "csv-source-title" });
    const buttonGroup = toolbar.createDiv({ cls: "csv-source-button-group" });
    this.addToolbarButton(buttonGroup, "表格模式", "table", "切换到表格模式", async () => {
      const file = this.file;
      if (!file) return;
      const leaf = this.app.workspace.getLeaf(true);
      await leaf.openFile(file, { active: true });
      await leaf.setViewState({
        type: "csv-view",
        active: true,
        state: { file: file.path }
      });
      this.leaf.detach();
    });

    // CodeMirror 编辑器容器
    const cmContainer = editorContainer.createDiv({ cls: "csv-source-cm-container" });

    const extensions: Extension[] = [
      lineNumbers(),
      drawSelection(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      separatorHighlightPlugin,
      placeholder("输入 CSV 源码..."),
      EditorView.lineWrapping,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          this.save();
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
    await this.save();
  }

  getViewData(): string {
    return this.editor ? this.editor.state.doc.toString() : this.data || "";
  }

  setViewData(data: string, clear: boolean): void {
    if (clear) this.clear();
    this.data = data;
    if (this.editor) {
      const transaction = this.editor.state.update({
        changes: { from: 0, to: this.editor.state.doc.length, insert: data }
      });
      this.editor.dispatch(transaction);
    }
  }

  clear(): void {
    this.data = "";
    if (this.editor) {
      const transaction = this.editor.state.update({
        changes: { from: 0, to: this.editor.state.doc.length, insert: "" }
      });
      this.editor.dispatch(transaction);
    }
  }
}
