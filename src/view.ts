import {
	TextFileView,
	ButtonComponent,
	Notice,
	DropdownComponent,
	getIcon,
	IconName,
	Setting,
} from "obsidian";
import { CSVUtils, CSVParseConfig } from "./utils/csv-utils";
import { TableHistoryManager } from "./utils/history-manager";
import { TableUtils } from "./utils/table-utils";
import { FileUtils } from "./utils/file-utils";
import { i18n } from "./i18n"; // 修正导入路径
import { renderEditBar } from "./view/edit-bar";

export const VIEW_TYPE_CSV = "csv-view";

export class CSVView extends TextFileView {
	tableData: string[][] = [[""]];
	tableEl: HTMLElement;
	operationEl: HTMLElement;

	// 使用新的历史记录管理器
	private historyManager: TableHistoryManager;
	private maxHistorySize: number = 50;

	// 列宽调整设置
	private columnWidths: number[] = [];
	private autoResize: boolean = true;

	// 新增：解析器设置状态
	private delimiter: string = ",";
	private quoteChar: string = '"';

	// 编辑栏
	private editBarEl: HTMLElement;
	private editInput: HTMLInputElement;
	private activeCellEl: HTMLInputElement | null = null;
	private activeRowIndex: number = -1;
	private activeColIndex: number = -1;

	// 新增：选中状态
	private selectedRow: number = -1;
	private selectedCol: number = -1;

	// 新增：搜索相关属性
	private searchInput: HTMLInputElement;
	private searchResults: HTMLElement;
	private searchContainer: HTMLElement;
	private searchMatches: Array<{row: number, col: number, value: string}> = [];
	private currentSearchIndex: number = -1;

	// 新增：源码模式相关属性
	private isSourceMode: boolean = false;
	private sourceTextarea: HTMLTextAreaElement | null = null;
	private sourceCursorPos: { start: number, end: number } = { start: 0, end: 0 };

	constructor(leaf: any) {
		super(leaf);
		this.historyManager = new TableHistoryManager(
			undefined,
			this.maxHistorySize
		);

		// Setup safe save method with retry logic
		this.setupSafeSave();
	}

	getIcon(): IconName {
		return "table";
	}
	getViewData() {
		return CSVUtils.unparseCSV(this.tableData);
	}

	// We need to create a wrapper for the original requestSave
	private originalRequestSave: () => void;

	/**
	 * Setup safe save method with retry logic
	 */
	private setupSafeSave() {
		// Store the original requestSave function
		this.originalRequestSave = this.requestSave;

		// Replace with our version that includes retry logic
		this.requestSave = async () => {
			try {
				// Use our retry utility to handle file busy errors
				await FileUtils.withRetry(async () => {
					// Call the original requestSave method
					this.originalRequestSave();
					// Return a resolved promise to satisfy the async function
					return Promise.resolve();
				});
			} catch (error) {
				console.error("Failed to save CSV file after retries:", error);
				new Notice(
					`Failed to save file: ${error.message}. The file might be open in another program.`
				);
			}
		};
	}

	setViewData(data: string, clear: boolean) {
		try {
			// 使用新的分隔符设置解析CSV数据
			this.tableData = CSVUtils.parseCSV(data, {
				delimiter: this.delimiter,
				quoteChar: this.quoteChar,
			});

			// 确保至少有一行一列
			if (!this.tableData || this.tableData.length === 0) {
				this.tableData = [[""]];
			}

			// 使所有行的列数一致
			this.tableData = CSVUtils.normalizeTableData(this.tableData);

			// 初始化历史记录
			if (clear) {
				this.historyManager.reset(this.tableData);
			}

			this.refresh();
		} catch (error) {
			console.error("CSV处理错误:", error);

			// 出错时设置为空表格
			this.tableData = [[""]];
			if (clear) {
				this.historyManager.reset(this.tableData);
			}
			this.refresh();
		}
	}

	// 新增：重新解析和刷新视图的方法
	private reparseAndRefresh() {
		// 获取原始数据并用新设置重新解析
		const rawData = this.data;
		this.setViewData(rawData, false); // 重新运行setViewData但不清除历史
	}

	refresh() {
		// Safety check: ensure tableEl exists
		if (!this.contentEl) return;
		this.contentEl.querySelectorAll('.csv-source-mode').forEach(el => el.remove());
		if (this.isSourceMode) {
			// 源码模式：显示textarea
			let textarea = this.sourceTextarea;
			if (!textarea) {
				textarea = document.createElement('textarea');
				textarea.className = 'csv-source-mode';
				textarea.style.width = '100%';
				textarea.style.height = '60vh';
				this.sourceTextarea = textarea;
			}
			textarea.value = CSVUtils.unparseCSV(this.tableData);
			this.contentEl.appendChild(textarea);
			// 恢复光标
			if (this.sourceCursorPos) {
				setTimeout(() => {
					textarea.selectionStart = this.sourceCursorPos.start;
					textarea.selectionEnd = this.sourceCursorPos.end;
					textarea.focus();
				}, 0);
			}
			// 监听内容变更
			textarea.oninput = () => {
				try {
					this.tableData = CSVUtils.parseCSV(textarea.value, { delimiter: this.delimiter, quoteChar: this.quoteChar });
					this.requestSave();
				} catch (e) {}
			};
			return;
		}

		// Safety check: ensure tableData is initialized
		if (
			!this.tableData ||
			!Array.isArray(this.tableData) ||
			this.tableData.length === 0
		) {
			console.warn(
				"Table data not properly initialized, setting default"
			);
			this.tableData = [[""]];
		}

		this.tableEl.empty();

		// 创建表头行（包含列号）
		const headerRow = this.tableEl.createEl("thead").createEl("tr");

		// 计算初始列宽（如果未设置）
		if (this.columnWidths.length === 0 && this.tableData[0]) {
			this.columnWidths = TableUtils.calculateColumnWidths(
				this.tableData
			);
		}

		// 添加左上角单元格
		const cornerCell = headerRow.createEl("th", {
			cls: "csv-corner-cell",
		});

		// 创建列号行
		if (this.tableData[0]) {
			this.tableData[0].forEach((headerCell, index) => {
				const th = headerRow.createEl("th", {
					cls: "csv-col-number",
					attr: {
						style: `width: ${this.columnWidths[index] || 100}px`,
					},
				});

				// 显示列号（A, B, C...）
				th.textContent = this.getColumnLabel(index);

				// 添加列选择功能
				th.onclick = () => {
					this.selectColumn(index);
				};
			});
		}

		// 创建表头数据行
		const dataHeaderRow = this.tableEl.createEl("thead").createEl("tr");
		
		// 添加行号列（表头行）
		const headerRowNumber = dataHeaderRow.createEl("th", {
			cls: "csv-row-number",
		});
		headerRowNumber.textContent = "0";

		// 添加表头输入框
		if (this.tableData[0]) {
			this.tableData[0].forEach((headerCell, index) => {
				const th = dataHeaderRow.createEl("th", {
					cls: "csv-th",
					attr: {
						style: `width: ${this.columnWidths[index] || 100}px`,
					},
				});

				// 添加列标题
				const headerInput = th.createEl("input", {
					cls: "csv-cell-input",
					attr: { value: headerCell },
				});

				// 列标题内容变更时的处理
				headerInput.oninput = (ev) => {
					if (ev.currentTarget instanceof HTMLInputElement) {
						if (
							this.tableData[0][index] !== ev.currentTarget.value
						) {
							this.saveSnapshot();
						}
						this.tableData[0][index] = ev.currentTarget.value;
						this.requestSave();
					}
				};

				// 为表头输入框添加聚焦事件
				headerInput.onfocus = (ev) => {
					this.setActiveCell(
						0,
						index,
						ev.currentTarget as HTMLInputElement
					);
				};

				// 添加调整列宽的手柄
				const resizeHandle = th.createEl("div", {
					cls: "resize-handle",
				});

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

			// 添加行号列
			const rowNumberCell = tableRow.createEl("td", {
				cls: "csv-row-number",
			});
			rowNumberCell.textContent = i.toString();

			// 添加行选择功能
			rowNumberCell.onclick = () => {
				this.selectRow(i);
			};

			// 添加数据单元格
			row.forEach((cell, j) => {
				const td = tableRow.createEl("td", {
					attr: { style: `width: ${this.columnWidths[j] || 100}px` },
				});

				const input = td.createEl("input", {
					cls: "csv-cell-input",
					attr: {
						value: cell,
					},
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
						if (
							this.activeCellEl === ev.currentTarget &&
							this.editInput
						) {
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
					this.setActiveCell(
						i,
						j,
						ev.currentTarget as HTMLInputElement
					);
				};
			});
		}

		// 在完成表格渲染后，更新滚动条容器的宽度
		// 找到包裹表格的容器元素
		const tableWrapper = this.tableEl.closest('.table-wrapper');
		if (tableWrapper) {
			// 获取表格实际宽度
			const tableWidth = this.tableEl.offsetWidth;
			
			// 更新顶部滚动条容器的宽度
			const topScroll = tableWrapper.querySelector('.top-scroll');
			
			if (topScroll) {
				// 创建一个与表格等宽的占位div
				const createSpacer = () => {
					const spacer = document.createElement('div');
					spacer.style.width = tableWidth + 'px';
					spacer.style.height = '1px';
					return spacer;
				};

				// 清空并添加新的占位元素
				topScroll.empty();
				topScroll.appendChild(createSpacer());
			}
		}
	}

	// 新增：获取列标签（A, B, C, ... Z, AA, AB, ...）
	private getColumnLabel(index: number): string {
		let result = '';
		let num = index;
		do {
			result = String.fromCharCode(65 + (num % 26)) + result;
			num = Math.floor(num / 26) - 1;
		} while (num >= 0);
		return result;
	}

	// 新增：选择行
	private selectRow(rowIndex: number) {
		// 如果点击的是已选中的行，则取消选择
		if (this.selectedRow === rowIndex) {
			this.clearSelection();
			return;
		}
		
		// 清除之前的选择
		this.clearSelection();
		
		this.selectedRow = rowIndex;
		
		// 添加选中样式到整行
		const rows = this.tableEl.querySelectorAll('tbody tr');
		const targetRowIndex = rowIndex - 1; // 因为数据行从索引1开始，tbody中的索引需要-1
		
		if (rows[targetRowIndex]) {
			rows[targetRowIndex].addClass('csv-row-selected');
		}
	}

	// 新增：选择列
	private selectColumn(colIndex: number) {
		// 如果点击的是已选中的列，则取消选择
		if (this.selectedCol === colIndex) {
			this.clearSelection();
			return;
		}
		
		// 清除之前的选择
		this.clearSelection();
		
		this.selectedCol = colIndex;
		
		// 添加选中样式到整列（包括列号和所有数据单元格）
		// colIndex + 2 是因为有行号列(+1)和从0开始的索引(+1)
		const columnCells = this.tableEl.querySelectorAll(`th:nth-child(${colIndex + 2}), td:nth-child(${colIndex + 2})`);
		
		columnCells.forEach(cell => {
			if (cell instanceof HTMLElement) {
				cell.addClass('csv-col-selected');
			}
		});
	}

	// 新增：清除选择
	private clearSelection() {
		this.selectedRow = -1;
		this.selectedCol = -1;
		
		// 移除所有选中样式
		this.tableEl.querySelectorAll('.csv-row-selected, .csv-col-selected').forEach(el => {
			if (el instanceof HTMLElement) {
				el.removeClass('csv-row-selected');
				el.removeClass('csv-col-selected');
			}
		});
	}

	// 设置活动单元格
	private setActiveCell(
		rowIndex: number,
		colIndex: number,
		cellEl: HTMLInputElement
	) {
		// 移除之前单元格的高亮
		if (this.activeCellEl && this.activeCellEl.parentElement) {
			this.activeCellEl.parentElement.removeClass("csv-active-cell");
		}

		// 设置新的活动单元格
		this.activeRowIndex = rowIndex;
		this.activeColIndex = colIndex;
		this.activeCellEl = cellEl;

		// 高亮当前单元格
		if (cellEl.parentElement) {
			cellEl.parentElement.addClass("csv-active-cell");
		}

		// 更新编辑栏内容
		if (this.editInput && this.editBarEl) {
			renderEditBar({
				editBarEl: this.editBarEl,
				editInput: this.editInput,
				activeCellEl: cellEl,
				activeRowIndex: rowIndex,
				activeColIndex: colIndex,
				tableData: this.tableData,
				onEdit: (row, col, value) => {
					this.saveSnapshot();
					this.tableData[row][col] = value;
					this.requestSave();
				},
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

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);

			e.preventDefault();
		};

		const onMouseMove = (e: MouseEvent) => {
			const width = startWidth + (e.clientX - startX);
			if (width >= 50) {
				// 最小宽度限制
				this.columnWidths[columnIndex] = width;
				this.refresh();
			}
		};

		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
		};

		handle.addEventListener("mousedown", onMouseDown);
	}

	// 设置输入框自动调整高度
	private setupAutoResize(input: HTMLInputElement) {
		// 初始调整
		this.adjustInputHeight(input);

		// 监听内容变化
		input.addEventListener("input", () => {
			if (this.autoResize) {
				this.adjustInputHeight(input);
			}
		});
	}

	// 调整输入框高度
	private adjustInputHeight(input: HTMLInputElement) {
		// Style moved to styles.css: input.style.height = 'auto';

		// 获取内容行数
		const lineCount = (input.value.match(/\n/g) || []).length + 1;
		const minHeight = 24; // 最小高度
		const lineHeight = 20; // 每行高度

		// 设置高度，确保能显示所有内容
		const newHeight = Math.max(minHeight, lineCount * lineHeight);
		input.style.height = `${newHeight}px`;
	}

	// 保存当前状态到历史记录
	private saveSnapshot() {
		this.historyManager.push(this.tableData);
	}

	// 执行撤销操作
	undo() {
		const prevState = this.historyManager.undo();
		if (prevState) {
			this.tableData = prevState;
			this.refresh();
			this.requestSave();
		}
	}

	// 执行重做操作
	redo() {
		const nextState = this.historyManager.redo();
		if (nextState) {
			this.tableData = nextState;
			this.refresh();
			this.requestSave();
		}
	}

	clear() {
		this.tableData = [[""]];
		this.historyManager.reset(this.tableData);
		this.refresh();
	}

	getViewType() {
		return VIEW_TYPE_CSV;
	}

	async onOpen() {
		try {
			// Clear the content element first
			this.contentEl.empty();

			// 创建操作区
			this.operationEl = this.contentEl.createEl("div", {
				cls: "csv-operations",
			});

			// 新增：解析器设置UI
			const parserSettingsEl = this.operationEl.createEl("div", {
				cls: "csv-parser-settings",
			});

			new Setting(parserSettingsEl)
				.setName(i18n.t("settings.fieldSeparator"))
				.setDesc(i18n.t("settings.fieldSeparatorDesc"))
				.addText((text) => {
					text.setValue(this.delimiter)
						.setPlaceholder("例如：, 或 ; 或 \\t 表示制表符")
						.onChange(async (value) => {
							// 处理制表符的特殊情况
							this.delimiter = value === "\\t" ? "\t" : value;
							this.reparseAndRefresh();
						});
				});

			new Setting(parserSettingsEl)
				.setName(i18n.t("settings.quoteChar"))
				.setDesc(i18n.t("settings.quoteCharDesc"))
				.addText((text) => {
					text.setValue(this.quoteChar)
						.setPlaceholder('默认为双引号 "')
						.onChange(async (value) => {
							this.quoteChar = value || '"';
							this.reparseAndRefresh();
						});
				});

			// 创建操作按钮容器
			const buttonContainer = this.operationEl.createEl("div", {
				cls: "csv-operation-buttons",
			});

			// 撤销按钮
			new ButtonComponent(buttonContainer)
				.setButtonText(i18n.t("buttons.undo"))
				.setIcon("undo")
				.onClick(() => this.undo());

			// 重做按钮
			new ButtonComponent(buttonContainer)
				.setButtonText(i18n.t("buttons.redo"))
				.setIcon("redo")
				.onClick(() => this.redo());

			// 添加行按钮
			new ButtonComponent(buttonContainer)
				.setButtonText(i18n.t("buttons.addRow"))
				.onClick(() => this.addRow());

			// 删除行按钮
			new ButtonComponent(buttonContainer)
				.setButtonText(i18n.t("buttons.deleteRow"))
				.onClick(() => this.deleteRow());

			// 添加列按钮
			new ButtonComponent(buttonContainer)
				.setButtonText(i18n.t("buttons.addColumn"))
				.onClick(() => this.addColumn());

			// 删除列按钮
			new ButtonComponent(buttonContainer)
				.setButtonText(i18n.t("buttons.deleteColumn"))
				.onClick(() => this.deleteColumn());

			// 重置列宽按钮
			new ButtonComponent(buttonContainer)
				.setButtonText(i18n.t("buttons.resetColumnWidth"))
				.onClick(() => {
					this.columnWidths = [];
					this.calculateColumnWidths();
					this.refresh();
				});

			// 新增：在操作按钮容器中创建搜索容器
			this.createSearchContainer(buttonContainer);

			// CSV导入导出选项
			this.operationEl.createEl("div", { cls: "csv-export-import" });

			// 创建编辑栏（在操作区之后）
			this.editBarEl = this.contentEl.createEl("div", {
				cls: "csv-edit-bar",
			});
			// 创建编辑输入框
			this.editInput = this.editBarEl.createEl("input", {
				cls: "csv-edit-input",
				attr: { placeholder: i18n.t("editBar.placeholder") },
			});
			// 使用renderEditBar渲染编辑栏
			renderEditBar({
				editBarEl: this.editBarEl,
				editInput: this.editInput,
				activeCellEl: this.activeCellEl,
				activeRowIndex: this.activeRowIndex,
				activeColIndex: this.activeColIndex,
				tableData: this.tableData,
				onEdit: (row, col, value) => {
					this.saveSnapshot();
					this.tableData[row][col] = value;
					this.requestSave();
				},
			});

			// 创建表格区域 - 只使用顶部滚动条
			const tableWrapper = this.contentEl.createEl("div", {
				cls: "table-wrapper",
			});
			
			// 顶部滚动条
			const topScrollContainer = tableWrapper.createEl("div", {
				cls: "scroll-container top-scroll",
			});
			
			// 主表格容器
			const tableContainer = tableWrapper.createEl("div", {
				cls: "table-container main-scroll",
			});
			
			this.tableEl = tableContainer.createEl("table", {
				cls: "csv-lite-table",
			});

			// 设置滚动同步
			this.setupScrollSync(topScrollContainer, tableContainer);

			// 初始化历史记录
			if (!this.historyManager) {
				this.historyManager = new TableHistoryManager(
					this.tableData,
					this.maxHistorySize
				);
			}

			// 添加键盘事件监听器
			this.registerDomEvent(
				document,
				"keydown",
				(event: KeyboardEvent) => {
					// 检测Ctrl+Z (或Mac上的Cmd+Z)
					if ((event.ctrlKey || event.metaKey) && event.key === "z") {
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
				}
			);

			// Ensure tableData is initialized before refreshing
			if (
				!this.tableData ||
				!Array.isArray(this.tableData) ||
				this.tableData.length === 0
			) {
				this.tableData = [[""]];
			}

			// 初始化时刷新视图
			this.refresh();
		} catch (error) {
			console.error("Error in onOpen:", error);
			new Notice(`Failed to open CSV view: ${error.message}`);

			// Try to recover with minimal UI
			this.contentEl.empty();
			const errorDiv = this.contentEl.createEl("div", {
				cls: "csv-error",
			});
			errorDiv.createEl("h3", { text: "Error opening CSV file" });
			errorDiv.createEl("p", { text: error.message });

			// Create a minimal table with default data
			this.tableData = [[""]];
			this.tableEl = this.contentEl.createEl("table");
			this.refresh();
		}
	}

	private toggleSourceMode() {
		this.isSourceMode = !this.isSourceMode;
		// 切换到源码模式时保存当前表格选中单元格
		if (this.isSourceMode) {
			if (this.activeCellEl) {
				this.sourceCursorPos = { start: 0, end: 0 };
			}
		} else {
			// 切换回表格模式时，保存textarea光标位置
			if (this.sourceTextarea) {
				this.sourceCursorPos = {
					start: this.sourceTextarea.selectionStart,
					end: this.sourceTextarea.selectionEnd
				};
			}
		}
		this.refresh();
	}

	// 新增：创建搜索容器，接受父容器参数
	private createSearchContainer(parentContainer?: HTMLElement) {
		// 如果提供了父容器，在其中创建搜索框，否则在contentEl中创建
		const container = parentContainer || this.contentEl;
		
		this.searchContainer = container.createEl("div", {
			cls: "csv-search-container",
		});

		// 创建搜索输入框
		this.searchInput = this.searchContainer.createEl("input", {
			cls: "csv-search-input",
			attr: {
				type: "text",
				placeholder: i18n.t("search.placeholder"),
			},
		});

		// 创建搜索结果下拉列表
		this.searchResults = this.searchContainer.createEl("div", {
			cls: "csv-search-results",
		});

		// 设置搜索输入事件
		this.setupSearchEvents();
	}

	// 新增：设置搜索事件
	private setupSearchEvents() {
		let searchTimeout: NodeJS.Timeout;

		// 输入事件 - 防抖搜索
		this.searchInput.addEventListener("input", () => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				this.performSearch(this.searchInput.value);
			}, 300);
		});

		// 焦点事件 - 显示结果
		this.searchInput.addEventListener("focus", () => {
			if (this.searchMatches.length > 0) {
				this.searchResults.addClass("show");
			}
		});

		// 键盘导航
		this.searchInput.addEventListener("keydown", (e) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				this.navigateSearchResults(1);
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				this.navigateSearchResults(-1);
			} else if (e.key === "Enter") {
				e.preventDefault();
				this.selectCurrentSearchResult();
			} else if (e.key === "Escape") {
				this.hideSearchResults();
			}
		});

		// 点击外部隐藏结果
		document.addEventListener("click", (e) => {
			if (!this.searchContainer.contains(e.target as Node)) {
				this.hideSearchResults();
			}
		});
	}

	// 新增：执行搜索
	private performSearch(query: string) {
		this.searchMatches = [];
		this.currentSearchIndex = -1;

		if (!query.trim()) {
			this.hideSearchResults();
			this.clearSearchHighlights();
			return;
		}

		const searchTerm = query.toLowerCase().trim();
		
		// 搜索所有单元格
		for (let i = 0; i < this.tableData.length; i++) {
			for (let j = 0; j < this.tableData[i].length; j++) {
				const cellValue = this.tableData[i][j];
				if (cellValue.toLowerCase().includes(searchTerm)) {
					this.searchMatches.push({
						row: i,
						col: j,
						value: cellValue
					});
				}
			}
		}

		this.displaySearchResults(query);
	}

	// 新增：显示搜索结果
	private displaySearchResults(query: string) {
		this.searchResults.empty();

		if (this.searchMatches.length === 0) {
			const noResults = this.searchResults.createEl("div", {
				cls: "csv-search-result-item",
				text: i18n.t("search.noResults"),
			});
			noResults.style.color = "var(--text-muted)";
			this.searchResults.addClass("show");
			return;
		}

		// 限制显示前10个结果
		const displayMatches = this.searchMatches.slice(0, 10);
		
		displayMatches.forEach((match, index) => {
			const resultItem = this.searchResults.createEl("div", {
				cls: "csv-search-result-item",
			});

			// 单元格地址和预览
			const cellInfo = resultItem.createEl("div");
			
			const cellAddress = cellInfo.createEl("span", {
				cls: "csv-search-result-cell",
				text: this.getCellAddress(match.row, match.col),
			});

			const addressSpan = cellInfo.createEl("span", {
				cls: "csv-search-result-address",
				text: i18n.t("search.rowColumn", { 
					row: (match.row + 1).toString(), 
					col: (match.col + 1).toString() 
				}),
			});

			// 内容预览（高亮搜索词）
			const preview = resultItem.createEl("div", {
				cls: "csv-search-result-preview",
			});
			
			const highlightedText = this.highlightSearchTerm(match.value, query);
			preview.innerHTML = highlightedText;

			// 点击跳转
			resultItem.addEventListener("click", () => {
				this.jumpToCell(match.row, match.col);
				this.hideSearchResults();
			});

			// 保存索引用于键盘导航
			resultItem.setAttribute("data-index", index.toString());
		});

		if (this.searchMatches.length > 10) {
			const moreResults = this.searchResults.createEl("div", {
				cls: "csv-search-result-item",
				text: i18n.t("search.moreResults", { 
					count: (this.searchMatches.length - 10).toString() 
				}),
			});
			moreResults.style.color = "var(--text-muted)";
			moreResults.style.fontStyle = "italic";
		}

		this.searchResults.addClass("show");
	}

	// 新增：高亮搜索词
	private highlightSearchTerm(text: string, searchTerm: string): string {
		if (!searchTerm.trim()) return text;
		
		const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
		return text.replace(regex, '<span class="csv-search-highlight">$1</span>');
	}

	// 新增：获取单元格地址
	private getCellAddress(row: number, col: number): string {
		return `${this.getColumnLabel(col)}${row + 1}`;
	}

	// 新增：键盘导航搜索结果
	private navigateSearchResults(direction: number) {
		const items = this.searchResults.querySelectorAll(".csv-search-result-item[data-index]");
		if (items.length === 0) return;

		// 移除当前高亮
		items.forEach(item => item.removeClass("csv-search-result-hover"));

		// 计算新索引
		this.currentSearchIndex = Math.max(0, Math.min(
			items.length - 1,
			this.currentSearchIndex + direction
		));

		// 高亮当前项
		const currentItem = items[this.currentSearchIndex] as HTMLElement;
		if (currentItem) {
			currentItem.addClass("csv-search-result-hover");
			currentItem.scrollIntoView({ block: "nearest" });
		}
	}

	// 新增：选择当前搜索结果
	private selectCurrentSearchResult() {
		if (this.currentSearchIndex >= 0 && this.currentSearchIndex < this.searchMatches.length) {
			const match = this.searchMatches[this.currentSearchIndex];
			this.jumpToCell(match.row, match.col);
			this.hideSearchResults();
		}
	}

	// 新增：跳转到指定单元格
	private jumpToCell(row: number, col: number) {
		// 清除之前的高亮
		this.clearSearchHighlights();

		// 找到目标单元格
		const targetInput = this.findCellInput(row, col);
		if (targetInput) {
			// 滚动到视图中
			targetInput.scrollIntoView({ 
				behavior: "smooth", 
				block: "center", 
				inline: "center" 
			});

			// 聚焦并选中
			setTimeout(() => {
				targetInput.focus();
				targetInput.select();
				
				// 添加高亮效果
				if (targetInput.parentElement) {
					targetInput.parentElement.addClass("csv-search-current");
					
					// 3秒后移除高亮
					setTimeout(() => {
						if (targetInput.parentElement) {
							targetInput.parentElement.removeClass("csv-search-current");
						}
					}, 3000);
				}
			}, 100);
		}
	}

	// 新增：查找单元格输入框
	private findCellInput(row: number, col: number): HTMLInputElement | null {
		// 根据行列位置查找对应的输入框
		const tableRows = this.tableEl.querySelectorAll("tr");
		
		// 考虑表头行的偏移
		const targetRowIndex = row === 0 ? 1 : row + 1; // 第一行是列号行，第二行是表头数据行
		
		if (targetRowIndex < tableRows.length) {
			const targetRow = tableRows[targetRowIndex];
			const cells = targetRow.querySelectorAll("td, th");
			
			// +1 因为第一列是行号列
			const targetCellIndex = col + 1;
			
			if (targetCellIndex < cells.length) {
				const targetCell = cells[targetCellIndex];
				return targetCell.querySelector("input") as HTMLInputElement;
			}
		}
		
		return null;
	}

	// 新增：隐藏搜索结果
	private hideSearchResults() {
		this.searchResults.removeClass("show");
		this.currentSearchIndex = -1;
	}

	// 新增：清除搜索高亮
	private clearSearchHighlights() {
		this.tableEl.querySelectorAll(".csv-search-current").forEach(el => {
			if (el instanceof HTMLElement) {
				el.removeClass("csv-search-current");
			}
		});
	}

	// 设置表格内容
	setTableContent(content: string[][]) {
		this.tableData = content;
		this.refresh();
	}

	// 获取表格内容
	getTableContent(): string[][] {
		return this.tableData;
	}

	// 计算列宽
	calculateColumnWidths() {
		this.columnWidths = TableUtils.calculateColumnWidths(this.tableData);
	}

	// 简化滚动同步方法
	private setupScrollSync(topScroll: HTMLElement, mainScroll: HTMLElement) {
		// 监听主表格容器的滚动事件，同步到顶部滚动条
		mainScroll.addEventListener('scroll', () => {
			topScroll.scrollLeft = mainScroll.scrollLeft;
		});

		// 监听顶部滚动条的滚动事件，同步到主表格
		topScroll.addEventListener('scroll', () => {
			mainScroll.scrollLeft = topScroll.scrollLeft;
		});
	}

	async onClose() {
		// 移除自定义样式
		const styleEl = document.head.querySelector("#csv-edit-bar-styles");
		if (styleEl) styleEl.remove();

		this.contentEl.empty();
	}

	// 表格操作方法
	addRow() {
		this.saveSnapshot();
		this.tableData = TableUtils.addRow(this.tableData);
		this.refresh();
		this.requestSave();
	}

	deleteRow() {
		this.saveSnapshot();
		this.tableData = TableUtils.deleteRow(this.tableData);
		this.refresh();
		this.requestSave();
	}

	addColumn() {
		this.saveSnapshot();
		this.tableData = TableUtils.addColumn(this.tableData);
		this.refresh();
		this.requestSave();
	}

	deleteColumn() {
		this.saveSnapshot();
		this.tableData = TableUtils.deleteColumn(this.tableData);
		this.refresh();
		this.requestSave();
	}
}
