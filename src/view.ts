import { TextFileView, ButtonComponent, Notice, DropdownComponent } from "obsidian";

export const VIEW_TYPE_CSV = "csv-view";

export class CSVView extends TextFileView {
  tableData: string[][];
  tableEl: HTMLElement;
  operationEl: HTMLElement;
  
  // 添加历史记录相关变量
  private history: string[][][]; // 保存表格历史状态
  private currentHistoryIndex: number; // 当前历史状态索引
  private maxHistorySize: number = 50; // 最大历史记录数量

  // 添加列宽调整设置
  private columnWidths: number[] = [];
  private autoResize: boolean = true; // 始终启用自动调整

  getViewData() {
    return this.tableData.map((row) => row.join(",")).join("\n");
  }

  setViewData(data: string, clear: boolean) {
    this.tableData = data.split("\n").map((line) => line.split(","));
    
    // 初始化历史记录
    if (clear) {
      this.initHistory();
    }
    
    this.refresh();
  }

  // 初始化历史记录
  private initHistory() {
    this.history = [this.deepCloneTableData()];
    this.currentHistoryIndex = 0;
  }
  
  // 深拷贝表格数据
  private deepCloneTableData(): string[][] {
    return this.tableData.map(row => [...row]);
  }
  
  // 保存当前状态到历史记录
  private saveSnapshot() {
    // 删除当前索引之后的所有历史记录（如果有的话）
    if (this.currentHistoryIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentHistoryIndex + 1);
    }
    
    // 添加新的快照
    this.history.push(this.deepCloneTableData());
    
    // 如果历史记录超过最大限制，删除最早的记录
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.currentHistoryIndex++;
    }
  }
  
  // 执行撤销操作
  undo() {
    if (this.currentHistoryIndex > 0) {
      this.currentHistoryIndex--;
      this.tableData = this.deepCloneTableData(this.history[this.currentHistoryIndex]);
      this.refresh();
      this.requestSave();
      new Notice("已撤销上一步操作");
    } else {
      new Notice("没有更多可撤销的操作");
    }
  }
  
  // 执行重做操作
  redo() {
    if (this.currentHistoryIndex < this.history.length - 1) {
      this.currentHistoryIndex++;
      this.tableData = this.deepCloneTableData(this.history[this.currentHistoryIndex]);
      this.refresh();
      this.requestSave();
      new Notice("已重做操作");
    } else {
      new Notice("没有更多可重做的操作");
    }
  }
  
  // 深拷贝特定历史记录
  private deepCloneTableData(data?: string[][]): string[][] {
    return data ? data.map(row => [...row]) : this.tableData.map(row => [...row]);
  }

  refresh() {
    this.tableEl.empty();
    
    // 创建表头行用于调整列宽
    const headerRow = this.tableEl.createEl("thead").createEl("tr");
    
    // 计算初始列宽（如果未设置）
    if (this.columnWidths.length === 0 && this.tableData[0]) {
      this.calculateColumnWidths();
    }
    
    // 创建表头和调整列宽的手柄
    if (this.tableData[0]) {
      this.tableData[0].forEach((headerCell, index) => {
        const th = headerRow.createEl("th", { 
          cls: "csv-th",
          attr: { 
            style: `width: ${this.columnWidths[index] || 100}px;`
          }
        });
        
        // 添加列标题
        const headerInput = th.createEl("input", { 
          attr: { value: headerCell }
        });
        
        // 列标题内容变更时的处理
        headerInput.oninput = (ev) => {
          if (ev.currentTarget instanceof HTMLInputElement) {
            if (this.tableData[0][index] !== ev.currentTarget.value) {
              this.saveSnapshot();
            }
            this.tableData[0][index] = ev.currentTarget.value;
            this.requestSave();
          }
        };
        
        // 添加调整列宽的手柄
        const resizeHandle = th.createEl("div", { cls: "resize-handle" });
        
        // 实现列宽调整
        this.setupColumnResize(resizeHandle, index);
      });
    }
    
    // 创建表格主体
    const tableBody = this.tableEl.createEl("tbody");

    // 从第二行开始显示数据行（如果有表头）
    const startRowIndex = this.tableData.length > 1 ? 1 : 0;
    
    for (let i = startRowIndex; i < this.tableData.length; i++) {
      const row = this.tableData[i];
      const tableRow = tableBody.createEl("tr");
      
      row.forEach((cell, j) => {
        const td = tableRow.createEl("td", {
          attr: {
            style: `width: ${this.columnWidths[j] || 100}px;`
          }
        });
        
        const input = td.createEl("input", { 
          attr: { 
            value: cell,
            style: "min-height: 24px;" 
          }
        });
        
        // 为输入框添加自动调整高度的功能
        this.setupAutoResize(input);
        
        input.oninput = (ev) => {
          if (ev.currentTarget instanceof HTMLInputElement) {
            // 保存历史状态（仅在第一次修改时保存）
            if (this.tableData[i][j] !== ev.currentTarget.value) {
              this.saveSnapshot();
            }
            
            this.tableData[i][j] = ev.currentTarget.value;
            this.requestSave();
            
            // 自动调整输入框高度
            if (this.autoResize) {
              this.adjustInputHeight(ev.currentTarget);
            }
          }
        };
      });
    }
  }
  
  // 设置列宽调整功能
  private setupColumnResize(handle: HTMLElement, columnIndex: number) {
    let startX: number;
    let startWidth: number;
    
    const onMouseDown = (e: MouseEvent) => {
      startX = e.clientX;
      startWidth = this.columnWidths[columnIndex] || 100;
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      
      e.preventDefault();
    };
    
    const onMouseMove = (e: MouseEvent) => {
      const width = startWidth + (e.clientX - startX);
      if (width >= 50) { // 最小宽度限制
        this.columnWidths[columnIndex] = width;
        this.refresh();
      }
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    handle.addEventListener('mousedown', onMouseDown);
  }
  
  // 计算初始列宽
  private calculateColumnWidths() {
    if (!this.tableData[0]) return;
    
    // 初始化所有列为默认宽度
    this.columnWidths = this.tableData[0].map(() => 100);
    
    // 根据内容长度进行简单调整
    this.tableData.forEach(row => {
      row.forEach((cell, index) => {
        // 根据内容长度估算合适的宽度
        const estimatedWidth = Math.max(50, Math.min(300, cell.length * 10));
        this.columnWidths[index] = Math.max(this.columnWidths[index], estimatedWidth);
      });
    });
  }
  
  // 设置输入框自动调整高度
  private setupAutoResize(input: HTMLInputElement) {
    // 初始调整
    this.adjustInputHeight(input);
    
    // 监听内容变化
    input.addEventListener('input', () => {
      if (this.autoResize) {
        this.adjustInputHeight(input);
      }
    });
  }
  
  // 调整输入框高度
  private adjustInputHeight(input: HTMLInputElement) {
    input.style.height = 'auto';
    
    // 获取内容行数
    const lineCount = (input.value.match(/\n/g) || []).length + 1;
    const minHeight = 24; // 最小高度
    const lineHeight = 20; // 每行高度
    
    // 设置高度，确保能显示所有内容
    const newHeight = Math.max(minHeight, lineCount * lineHeight);
    input.style.height = `${newHeight}px`;
  }

  clear() {
    this.tableData = [];
    this.initHistory();
  }

  getViewType() {
    return VIEW_TYPE_CSV;
  }

  async onOpen() {
    // 创建操作区
    this.operationEl = this.contentEl.createEl("div", { cls: "csv-operations" });
    
    // 添加常用操作按钮
    const buttonContainer = this.operationEl.createEl("div", { cls: "csv-operation-buttons" });
    
    // 撤销按钮
    new ButtonComponent(buttonContainer)
      .setButtonText("撤销")
      .setIcon("undo")
      .onClick(() => this.undo());
      
    // 重做按钮
    new ButtonComponent(buttonContainer)
      .setButtonText("重做")
      .setIcon("redo")
      .onClick(() => this.redo());
    
    // 添加行按钮
    new ButtonComponent(buttonContainer)
      .setButtonText("添加行")
      .onClick(() => this.addRow());
    
    // 删除行按钮
    new ButtonComponent(buttonContainer)
      .setButtonText("删除行")
      .onClick(() => this.deleteRow());
    
    // 添加列按钮
    new ButtonComponent(buttonContainer)
      .setButtonText("添加列")
      .onClick(() => this.addColumn());
    
    // 删除列按钮
    new ButtonComponent(buttonContainer)
      .setButtonText("删除列")
      .onClick(() => this.deleteColumn());

    // 添加列宽自动调整选项
    const settingsContainer = this.operationEl.createEl("div", { cls: "csv-settings" });
    
    // 添加自动调整高度开关
    const autoResizeLabel = settingsContainer.createEl("label", { cls: "csv-setting-item" });
    autoResizeLabel.createEl("span", { text: "自动调整行高: " });
    const autoResizeToggle = autoResizeLabel.createEl("input", { 
      attr: { type: "checkbox", checked: this.autoResize } 
    });
    
    autoResizeToggle.addEventListener("change", (e) => {
      if (e.currentTarget instanceof HTMLInputElement) {
        this.autoResize = e.currentTarget.checked;
        this.refresh();
      }
    });
    
    // 重置列宽按钮
    new ButtonComponent(settingsContainer)
      .setButtonText("重置列宽")
      .onClick(() => {
        this.columnWidths = [];
        this.calculateColumnWidths();
        this.refresh();
      });

    // 创建一个分隔线
    this.contentEl.createEl("hr");
    
    // 创建表格区域
    this.tableEl = this.contentEl.createEl("table");
    
    // 初始化历史记录
    this.initHistory();
    
    // 添加键盘事件监听器
    this.registerDomEvent(document, 'keydown', (event: KeyboardEvent) => {
      // 检测Ctrl+Z (或Mac上的Cmd+Z)
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        if (event.shiftKey) {
          // Ctrl+Shift+Z 或 Cmd+Shift+Z 重做
          event.preventDefault();
          this.redo();
        } else {
          // Ctrl+Z 或 Cmd+Z 撤销
          event.preventDefault();
          this.undo();
        }
      }
    });
    
    // 初始化时刷新视图
    this.refresh();
  }

  async onClose() {
    this.contentEl.empty();
  }
  
  // 修改现有方法，添加快照保存
  addRow() {
    // 保存当前状态到历史记录
    this.saveSnapshot();
    
    // 在表格末尾添加一个空行
    const newRow = Array(this.tableData[0]?.length || 1).fill("");
    this.tableData.push(newRow);
    this.refresh();
    this.requestSave();
  }
  
  deleteRow() {
    // 删除最后一行（如果有超过一行）
    if (this.tableData.length > 1) {
      // 保存当前状态到历史记录
      this.saveSnapshot();
      
      this.tableData.pop();
      this.refresh();
      this.requestSave();
    } else {
      new Notice("至少需要保留一行");
    }
  }
  
  addColumn() {
    // 保存当前状态到历史记录
    this.saveSnapshot();
    
    // 在每一行末尾添加一个空列
    this.tableData.forEach(row => row.push(""));
    this.refresh();
    this.requestSave();
  }
  
  deleteColumn() {
    // 删除最后一列（如果有超过一列）
    if (this.tableData[0].length > 1) {
      // 保存当前状态到历史记录
      this.saveSnapshot();
      
      this.tableData.forEach(row => row.pop());
      this.refresh();
      this.requestSave();
    } else {
      new Notice("至少需要保留一列");
    }
  }
}
