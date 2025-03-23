import { TextFileView, ButtonComponent, Notice, DropdownComponent, requestUrl } from "obsidian";
import * as Papa from 'papaparse';

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
  
  // Papa Parse 配置选项
  private papaConfig = {
    header: false,
    dynamicTyping: false, // 保持所有值为字符串
    skipEmptyLines: false // 保留空行以保持行号一致
  };

  // 添加简单的编辑栏
  private editBarEl: HTMLElement;
  private editInput: HTMLInputElement;
  private activeCellEl: HTMLInputElement | null = null;
  private activeRowIndex: number = -1;
  private activeColIndex: number = -1;

  getViewData() {
    // 使用 Papa Parse 将数据序列化为CSV字符串
    return Papa.unparse(this.tableData, {
      header: false,
      newline: "\n"
    });
  }

  setViewData(data: string, clear: boolean) {
    try {
      // 使用 Papa Parse 解析CSV数据
      const parseResult = Papa.parse(data, this.papaConfig);
      
      if (parseResult.errors && parseResult.errors.length > 0) {
        // 显示解析错误
        console.warn("CSV解析警告:", parseResult.errors);
        new Notice(`CSV解析提示: ${parseResult.errors[0].message}`);
      }
      
      this.tableData = parseResult.data as string[][];
      
      // 确保至少有一行一列
      if (!this.tableData || this.tableData.length === 0) {
        this.tableData = [[""]];
      }
      
      // 使所有行的列数一致
      this.normalizeTableData();
      
      // 初始化历史记录
      if (clear) {
        this.initHistory();
      }
      
      this.refresh();
    } catch (error) {
      console.error("CSV解析错误:", error);
      new Notice("CSV解析失败，请检查文件格式");
      
      // 出错时设置为空表格
      this.tableData = [[""]];
      if (clear) {
        this.initHistory();
      }
      this.refresh();
    }
  }
  
  // 确保表格数据规整（所有行有相同的列数）
  private normalizeTableData() {
    if (!this.tableData || this.tableData.length === 0) return;
    
    // 找出最大列数
    let maxCols = 0;
    for (const row of this.tableData) {
      maxCols = Math.max(maxCols, row.length);
    }
    
    // 确保每行都有相同的列数
    for (let i = 0; i < this.tableData.length; i++) {
      while (this.tableData[i].length < maxCols) {
        this.tableData[i].push("");
      }
    }
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
        
        // 为表头输入框添加聚焦事件
        headerInput.onfocus = (ev) => {
          this.setActiveCell(0, index, ev.currentTarget as HTMLInputElement);
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
            
            // 如果是当前活动单元格，同步到编辑栏
            if (this.activeCellEl === ev.currentTarget && this.editInput) {
              this.editInput.value = ev.currentTarget.value;
            }
            
            this.requestSave();
            
            // 自动调整输入框高度
            if (this.autoResize) {
              this.adjustInputHeight(ev.currentTarget);
            }
          }
        };
        
        // 为单元格输入框添加聚焦事件
        input.onfocus = (ev) => {
          this.setActiveCell(i, j, ev.currentTarget as HTMLInputElement);
        };
      });
    }
  }
  
  // 设置活动单元格
  private setActiveCell(rowIndex: number, colIndex: number, cellEl: HTMLInputElement) {
    // 设置新的活动单元格
    this.activeRowIndex = rowIndex;
    this.activeColIndex = colIndex;
    this.activeCellEl = cellEl;
    
    // 更新编辑栏内容
    if (this.editInput) {
      this.editInput.value = cellEl.value;
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
    
    // 创建两个标签页容器
    const tabsContainer = this.operationEl.createEl("div", { cls: "csv-tabs" });
    
    // 创建标签头部
    const tabHeaders = tabsContainer.createEl("div", { cls: "csv-tab-headers" });
    const contentTabHeader = tabHeaders.createEl("div", { cls: "csv-tab-header csv-tab-active", text: "内容" });
    const appearanceTabHeader = tabHeaders.createEl("div", { cls: "csv-tab-header", text: "外观" });
    
    // 创建内容标签页面板
    const contentTabPanel = tabsContainer.createEl("div", { cls: "csv-tab-panel csv-tab-panel-active" });
    
    // 添加内容相关操作按钮
    const contentButtonContainer = contentTabPanel.createEl("div", { cls: "csv-operation-buttons" });
    
    // 撤销按钮
    new ButtonComponent(contentButtonContainer)
      .setButtonText("撤销")
      .setIcon("undo")
      .onClick(() => this.undo());
      
    // 重做按钮
    new ButtonComponent(contentButtonContainer)
      .setButtonText("重做")
      .setIcon("redo")
      .onClick(() => this.redo());
    
    // 添加行按钮
    new ButtonComponent(contentButtonContainer)
      .setButtonText("添加行")
      .onClick(() => this.addRow());
    
    // 删除行按钮
    new ButtonComponent(contentButtonContainer)
      .setButtonText("删除行")
      .onClick(() => this.deleteRow());
    
    // 添加列按钮
    new ButtonComponent(contentButtonContainer)
      .setButtonText("添加列")
      .onClick(() => this.addColumn());
    
    // 删除列按钮
    new ButtonComponent(contentButtonContainer)
      .setButtonText("删除列")
      .onClick(() => this.deleteColumn());
    
    // 创建外观标签页面板
    const appearanceTabPanel = tabsContainer.createEl("div", { cls: "csv-tab-panel" });
    
    // 添加外观相关设置
    const appearanceSettings = appearanceTabPanel.createEl("div", { cls: "csv-settings" });
    
    // 重置列宽按钮
    new ButtonComponent(appearanceSettings)
      .setButtonText("重置列宽")
      .onClick(() => {
        this.columnWidths = [];
        this.calculateColumnWidths();
        this.refresh();
      });
    
    // 添加标签切换功能
    contentTabHeader.addEventListener("click", () => {
      contentTabHeader.addClass("csv-tab-active");
      appearanceTabHeader.removeClass("csv-tab-active");
      contentTabPanel.addClass("csv-tab-panel-active");
      appearanceTabPanel.removeClass("csv-tab-panel-active");
    });
    
    appearanceTabHeader.addEventListener("click", () => {
      appearanceTabHeader.addClass("csv-tab-active");
      contentTabHeader.removeClass("csv-tab-active");
      appearanceTabPanel.addClass("csv-tab-panel-active");
      contentTabPanel.removeClass("csv-tab-panel-active");
    });
    
    // 创建一个分隔线
    this.contentEl.createEl("hr");
        // 创建编辑栏（在操作区之前）
		this.editBarEl = this.contentEl.createEl("div", { cls: "csv-edit-bar" });
    
		// 创建编辑输入框
		this.editInput = this.editBarEl.createEl("input", { 
		  cls: "csv-edit-input",
		  attr: { placeholder: "编辑选中单元格..." }
		});
		
		// 添加编辑栏输入处理
		this.editInput.oninput = () => {
		  if (this.activeCellEl && this.activeRowIndex >= 0 && this.activeColIndex >= 0) {
			// 更新活动单元格
			this.activeCellEl.value = this.editInput.value;
			
			// 更新数据
			if (this.tableData[this.activeRowIndex][this.activeColIndex] !== this.editInput.value) {
			  this.saveSnapshot();
			}
			this.tableData[this.activeRowIndex][this.activeColIndex] = this.editInput.value;
			this.requestSave();
		  }
		};
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
    
    // 添加CSV导入导出选项到内容标签页
    const exportImportContainer = contentTabPanel.createEl("div", { cls: "csv-export-import" });
    
    // 添加分隔符选择
    const delimiterContainer = exportImportContainer.createEl("div", { cls: "csv-delimiter-container" });
    delimiterContainer.createEl("span", { text: "分隔符: " });
    
    const delimiterDropdown = new DropdownComponent(delimiterContainer);
    delimiterDropdown.addOption(",", "逗号 (,)");
    delimiterDropdown.addOption(";", "分号 (;)");
    delimiterDropdown.addOption("\t", "制表符 (Tab)");
    delimiterDropdown.setValue(",");
    
    // 设置分隔符改变时的处理函数
    delimiterDropdown.onChange(value => {
      this.papaConfig.delimiter = value;
      this.refresh();
    });
    
    // 添加高级解析设置
    const advancedContainer = appearanceSettings.createEl("div", { cls: "csv-advanced-settings" });
    
    // 添加首行作为表头选项
    const headerOption = advancedContainer.createEl("div", { cls: "csv-setting-item" });
    headerOption.createEl("span", { text: "首行作为表头" });
    const headerToggle = headerOption.createEl("input", { attr: { type: "checkbox" } });
    
    headerToggle.addEventListener("change", e => {
      if (e.currentTarget instanceof HTMLInputElement) {
        const headerRow = document.querySelector("thead tr");
        if (headerRow) {
          headerRow.toggleClass("csv-header-row", e.currentTarget.checked);
        }
      }
    });
    
    // 初始化时刷新视图
    this.refresh();
    
    // 添加样式
    this.addStyles();
  }

  // 添加样式
  private addStyles() {
    // 创建样式元素
    const styleEl = document.head.createEl('style');
    styleEl.id = 'csv-edit-bar-styles';
    styleEl.textContent = `
      .csv-edit-bar {
        padding: 5px;
        margin-bottom: 5px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .csv-edit-input {
        width: 100%;
        height: 28px;
        padding: 0 5px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
      }
    `;
  }

  async onClose() {
    // 移除自定义样式
    const styleEl = document.head.querySelector('#csv-edit-bar-styles');
    if (styleEl) styleEl.remove();
    
    this.contentEl.empty();
  }
  
  // 修改现有方法，添加快照保存
  addRow() {
    // 保存当前状态到历史记录
    this.saveSnapshot();
    
    // 获取最大列数
    const colCount = this.tableData.length > 0
      ? this.tableData[0].length
      : 1;
    
    // 在表格末尾添加一个空行
    const newRow = Array(colCount).fill("");
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
