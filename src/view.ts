import {
	TextFileView,
	ButtonComponent,
	Notice,
	DropdownComponent,
	getIcon,
	IconName,
	Setting,
	TFile,
} from "obsidian";
import { CSVUtils, CSVParseConfig } from "./utils/csv-utils";
import { TableHistoryManager } from "./utils/history-manager";
import { TableUtils } from "./utils/table-utils";
import { FileUtils } from "./utils/file-utils";
import { i18n } from "./i18n"; // 修正导入路径
import { renderEditBar } from "./view/edit-bar";
import { SearchBar } from "./view/search-bar";
import { renderTable } from "./view/table-render";
import { HighlightManager } from "./utils/highlight-manager";
import { setupHeaderContextMenu } from "./view/header-context-menu";

export const VIEW_TYPE_CSV = "csv-view";

export class CSVView extends TextFileView {
	public file: TFile | null;
	public headerEl: HTMLElement;

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

	// 新增：高亮管理器
	private highlightManager: HighlightManager;

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

	// 新增：搜索栏属性
	private searchBar: any; // SearchBar 实例

	// 新增：header context menu 解绑函数
	private headerContextMenuCleanup: (() => void) | null = null;

	// 新增：固定行列功能
	private stickyRows: Set<number> = new Set();
	private stickyColumns: Set<number> = new Set();

	constructor(leaf: any) {
		super(leaf);
		this.historyManager = new TableHistoryManager(
			undefined,
			this.maxHistorySize
		);
		// @ts-ignore
		this.file = (this as any).file;
		// @ts-ignore
		this.headerEl = (this as any).headerEl;
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
		// if (this.isSourceMode) {
		// 	// 源码模式：显示textarea
		// 	let textarea = this.sourceTextarea;
		// 	if (!textarea) {
		// 		textarea = document.createElement('textarea');
		// 		textarea.className = 'csv-source-mode';
		// 		textarea.style.width = '100%';
		// 		textarea.style.height = '60vh';
		// 		this.sourceTextarea = textarea;
		// 	}
		// 	textarea.value = CSVUtils.unparseCSV(this.tableData);
		// 	this.contentEl.appendChild(textarea);
		// 	// 恢复光标
		// 	if (this.sourceCursorPos && textarea) {
		// 		setTimeout(() => {
		// 			if (textarea) {
		// 				textarea.selectionStart = this.sourceCursorPos.start;
		// 				textarea.selectionEnd = this.sourceCursorPos.end;
		// 				textarea.focus();
		// 			}
		// 		}, 0);
		// 	}
		// 	// 监听内容变更
		// 	textarea.oninput = () => {
		// 		try {
		// 			if (textarea) {
		// 				this.tableData = CSVUtils.parseCSV(textarea.value, { delimiter: this.delimiter, quoteChar: this.quoteChar });
		// 				this.requestSave();
		// 			}
		// 		} catch (e) {}
		// 	};
		// 	return;
		// }

		// Safety check: ensure tableData is initialized
		if (!this.tableData || !Array.isArray(this.tableData) || this.tableData.length === 0) {
			console.warn("Table data not properly initialized, setting default");
			this.tableData = [[""]];
		}

		// 恢复原有表格渲染方式
		// 传递renderEditBar给renderTable，实现双向同步
		const renderEditBarBridge = (row: number, col: number, cellEl: HTMLInputElement) => {
			renderEditBar({
				editBarEl: this.editBarEl,
				editInput: this.editInput,
				activeCellEl: cellEl,
				activeRowIndex: row,
				activeColIndex: col,
				tableData: this.tableData,
				onEdit: (r, c, value) => {
					this.saveSnapshot();
					this.tableData[r][c] = value;
					this.requestSave();
				},
			});
		};

		renderTable({
			tableData: this.tableData,
			columnWidths: this.columnWidths,
			autoResize: this.autoResize,
			tableEl: this.tableEl,
			editInput: this.editInput,
			activeCellEl: this.activeCellEl,
			activeRowIndex: this.activeRowIndex,
			activeColIndex: this.activeColIndex,
			setActiveCell: (row, col, cellEl) => {
				this.setActiveCell(row, col, cellEl);
				renderEditBarBridge(row, col, cellEl);
			},
			saveSnapshot: () => this.saveSnapshot(),
			requestSave: () => this.requestSave(),
			setupAutoResize: (input) => this.setupAutoResize(input),
			adjustInputHeight: (input) => this.adjustInputHeight(input),
			selectRow: (rowIndex) => this.highlightManager.selectRow(rowIndex),
			selectColumn: (colIndex) => this.highlightManager.selectColumn(colIndex),
			getColumnLabel: (index) => this.getColumnLabel(index),
			setupColumnResize: (handle, columnIndex) => this.setupColumnResize(handle, columnIndex),
			insertRowAt: (rowIndex, after = false) => {
				this.saveSnapshot();
				const idx = after ? rowIndex + 1 : rowIndex;
				this.tableData.splice(idx, 0, Array(this.tableData[0].length).fill(""));
				this.refresh();
				this.requestSave();
			},
			deleteRowAt: (rowIndex) => {
				if (this.tableData.length <= 1) return;
				this.saveSnapshot();
				this.tableData.splice(rowIndex, 1);
				this.refresh();
				this.requestSave();
			},
			insertColAt: (colIndex, after = false) => {
				this.saveSnapshot();
				const idx = after ? colIndex + 1 : colIndex;
				this.tableData.forEach(row => row.splice(idx, 0, ""));
				this.refresh();
				this.requestSave();
			},
			deleteColAt: (colIndex) => {
				if (this.tableData[0].length <= 1) return;
				this.saveSnapshot();
				this.tableData.forEach(row => row.splice(colIndex, 1));
				this.refresh();
				this.requestSave();
			},
			// 新增：表格单元格编辑时同步编辑栏
			renderEditBar: renderEditBarBridge,
			// 新增：拖拽排序回调
			onColumnReorder: (from, to) => {
				if (from === to) return;
				this.saveSnapshot();
				// 交换所有行的列
				for (let row of this.tableData) {
					const [col] = row.splice(from, 1);
					row.splice(to, 0, col);
				}
				// 同步列宽
				if (this.columnWidths && this.columnWidths.length > 0) {
					const [w] = this.columnWidths.splice(from, 1);
					this.columnWidths.splice(to, 0, w);
				}
				this.refresh();
				this.requestSave();
			},
			onRowReorder: (from, to) => {
				if (from === to) return;
				this.saveSnapshot();
				const [row] = this.tableData.splice(from, 1);
				this.tableData.splice(to, 0, row);
				this.refresh();
				this.requestSave();
			},
			// 新增：固定行列相关回调
			stickyRows: this.stickyRows,
			stickyColumns: this.stickyColumns,
			toggleRowSticky: (rowIndex: number) => this.toggleRowSticky(rowIndex),
			toggleColumnSticky: (colIndex: number) => this.toggleColumnSticky(colIndex),
		});

		// 应用sticky样式
		this.applyStickyStyles();

		// 在完成表格渲染后，更新滚动条容器的宽度
		// 现在topScrollContainer在operationEl下方
		const topScroll = this.operationEl?.querySelector?.('.top-scroll');
		if (topScroll && this.tableEl) {
			const tableWidth = this.tableEl.offsetWidth;
			const createSpacer = () => {
				const spacer = document.createElement('div');
				spacer.style.width = tableWidth + 'px';
				spacer.style.height = '1px';
				return spacer;
			};
			topScroll.empty();
			topScroll.appendChild(createSpacer());
		}

		// 新增：每次刷新后为表格父容器绑定点击事件，点击非头部区域时清除高亮
		const tableContainer = this.tableEl.parentElement;
		if (tableContainer) {
			if ((this as any)._csvTableClickHandler) {
				tableContainer.removeEventListener('click', (this as any)._csvTableClickHandler);
			}
			const handler = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				// 如果点击的是列头（th.csv-col-number）或行号（td.csv-row-number），不清除高亮
				if (
					(target.tagName === 'TH' && target.classList.contains('csv-col-number')) ||
					(target.tagName === 'TD' && target.classList.contains('csv-row-number'))
				) {
					return;
				}
				this.highlightManager.clearSelection();
			};
			(this as any)._csvTableClickHandler = handler;
			tableContainer.addEventListener('click', handler);
		}

		// 关键：每次刷新前解绑旧的header context menu事件
		if (this.headerContextMenuCleanup) {
			this.headerContextMenuCleanup();
			this.headerContextMenuCleanup = null;
		}
		// 重新绑定并保存解绑函数
		this.headerContextMenuCleanup = setupHeaderContextMenu(
			this.tableEl,
			{
				selectRow: (rowIndex) => this.highlightManager.selectRow(rowIndex),
				selectColumn: (colIndex) => this.highlightManager.selectColumn(colIndex),
				clearSelection: () => this.highlightManager.clearSelection(),
				onMenuClose: () => {
					// 菜单关闭时的额外清理逻辑
					console.log('[DEBUG] Header context menu closed');
				},
				onInsertRowAbove: (rowIdx) => this.refreshInsertRow(rowIdx, false),
				onInsertRowBelow: (rowIdx) => this.refreshInsertRow(rowIdx, true),
				onDeleteRow: (rowIdx) => this.refreshDeleteRow(rowIdx),
				onMoveRowUp: (rowIdx) => this.moveRow(rowIdx, rowIdx - 1),
				onMoveRowDown: (rowIdx) => this.moveRow(rowIdx, rowIdx + 1),
				onInsertColLeft: (colIdx) => this.refreshInsertCol(colIdx, false),
				onInsertColRight: (colIdx) => this.refreshInsertCol(colIdx, true),
				onDeleteCol: (colIdx) => this.refreshDeleteCol(colIdx),
				onMoveColLeft: (colIdx) => this.moveCol(colIdx, colIdx - 1),
				onMoveColRight: (colIdx) => this.moveCol(colIdx, colIdx + 1),
			}
		);

		// 在 refresh 方法中调用 setupColumnResize，为列号和行号单元格绑定拖拽事件
		this.tableData[0].forEach((_, index) => {
			const resizeHandle = this.tableEl.querySelector(`.resize-handle[data-index='${index}']`) as HTMLElement;
			if (resizeHandle) {
				this.setupColumnResize(resizeHandle, index);
			}
		});

		this.tableData.forEach((_, rowIndex) => {
			const resizeHandleRow = this.tableEl.querySelector(`.resize-handle-row[data-row-index='${rowIndex}']`) as HTMLElement;
			if (resizeHandleRow) {
				this.setupColumnResize(resizeHandleRow, rowIndex);
			}
		});
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

	// 设置活动单元格
	private setActiveCell(
		rowIndex: number,
		colIndex: number,
		cellEl: HTMLInputElement
	) {
		// 移除之前单元格的高亮
		if (this.activeCellEl && this.activeCellEl.parentElement) {
			this.activeCellEl.parentElement.classList.remove("csv-active-cell");
		}

		// 设置新的活动单元格
		this.activeRowIndex = rowIndex;
		this.activeColIndex = colIndex;
		this.activeCellEl = cellEl;

		// 高亮当前单元格
		if (cellEl.parentElement) {
			cellEl.parentElement.classList.add("csv-active-cell");
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
			// 1. 在 view header 的 view-actions 区域插入切换按钮（lucide/file-code 图标）
			// 交互说明：
			// - 切换按钮始终位于 header 区域，风格与 Obsidian 原生一致。
			// - 点击时遍历所有 leaf，查找同一文件的目标视图（csv-source-view）。
			//   - 若有，则激活该 leaf（workspace.setActiveLeaf）。
			//   - 若无，则新建 leaf 并打开目标视图。
			// - 不主动关闭原有视图，用户可自行关闭。
			const actionsEl = this.headerEl?.querySelector?.('.view-actions');
			if (actionsEl && !actionsEl.querySelector('.csv-switch-source')) {
				const btn = document.createElement('button');
				btn.className = 'clickable-icon csv-switch-source';
				btn.setAttribute('aria-label', '切换到源码模式');
				btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-code"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="10 13 8 15 10 17"/><polyline points="14 13 16 15 14 17"/></svg>`;
				btn.onclick = async () => {
					const file = this.file;
					if (!file) return;
					const leaves = this.app.workspace.getLeavesOfType('csv-source-view');
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
						await newLeaf.openFile(file, { active: true, state: { mode: "source" } });
						await newLeaf.setViewState({
							type: "csv-source-view",
							active: true,
							state: { file: file.path }
						});
						this.app.workspace.setActiveLeaf(newLeaf, true, true);
					}
				};
				actionsEl.appendChild(btn);
			}

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

			// 创建操作按钮容器（外层flex，两端对齐）
			const buttonContainer = this.operationEl.createEl("div", {
				cls: "csv-operation-buttons",
			});
			// 按钮组（左侧）
			const buttonsGroup = buttonContainer.createEl("div", {
				cls: "csv-buttons-group"
			});
			// 搜索栏（右侧）
			const searchBarContainer = buttonContainer.createEl("div", {
				cls: "csv-search-bar-container"
			});
			this.searchBar = new SearchBar(searchBarContainer, {
				getTableData: () => this.tableData,
				tableEl: this.tableEl,
				getColumnLabel: (index: number) => this.getColumnLabel(index),
				getCellAddress: (row: number, col: number) => this.getCellAddress(row, col),
				jumpToCell: (row: number, col: number) => this.jumpToCell(row, col),
				clearSearchHighlights: () => this.clearSearchHighlights(),
			});

			// 撤销按钮
			new ButtonComponent(buttonsGroup)
				.setButtonText(i18n.t("buttons.undo"))
				.setIcon("undo")
				.onClick(() => this.undo());

			// 重做按钮
			new ButtonComponent(buttonsGroup)
				.setButtonText(i18n.t("buttons.redo"))
				.setIcon("redo")
				.onClick(() => this.redo());

			// 重置列宽按钮
			new ButtonComponent(buttonsGroup)
				.setButtonText(i18n.t("buttons.resetColumnWidth"))
				.onClick(() => {
					this.columnWidths = [];
					this.calculateColumnWidths();
					this.refresh();
				});



			// 编辑栏（sticky工具栏内，按钮和搜索栏之后）
			this.editBarEl = this.operationEl.createEl("div", {
				cls: "csv-edit-bar",
			});
			this.editInput = this.editBarEl.createEl("input", {
				cls: "csv-edit-input",
				attr: { placeholder: i18n.t("editBar.placeholder") },
			});
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

			// 创建顶部横向滚动条（移动到工具栏下方）
			const topScrollContainer = this.operationEl.createEl("div", {
				cls: "scroll-container top-scroll",
			});

			// 创建表格区域 - 移除顶部滚动条
			const tableWrapper = this.contentEl.createEl("div", {
				cls: "table-wrapper",
			});
			// 主表格容器
			const tableContainer = tableWrapper.createEl("div", {
				cls: "table-container main-scroll",
			});
			this.tableEl = tableContainer.createEl("table", {
				cls: "csv-lite-table",
			});
			// 初始化高亮管理器
			this.highlightManager = new HighlightManager(this.tableEl);

			// 设置滚动同步（传递新的topScrollContainer）
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

			// 新增：点击表格空白或单元格时取消行/列选中
			if (this.tableEl) {
				this.tableEl.addEventListener('click', (e: MouseEvent) => {
					const target = e.target as HTMLElement;
					// 判断是否点击在th（行/列头）上，或有csv-row-header/csv-col-header类
					if (
						target.tagName === 'TH' &&
						(target.classList.contains('csv-row-header') || target.classList.contains('csv-col-header'))
					) {
						// 点击头部，不处理
						return;
					}
					// 其他情况清除选中
					this.highlightManager.clearSelection();
				});
			}

			// 为工具栏添加sticky样式类
			this.operationEl.classList.add("csv-toolbar-sticky");
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

		// 解绑header context menu事件
		if (this.headerContextMenuCleanup) {
			this.headerContextMenuCleanup();
			this.headerContextMenuCleanup = null;
		}
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

	// 新增：获取单元格地址
	private getCellAddress(row: number, col: number): string {
		return `${this.getColumnLabel(col)}${row + 1}`;
	}

	// 新增：跳转到指定单元格
	private jumpToCell(row: number, col: number) {
		// 清除之前的高亮
		this.clearSearchHighlights();
		// 找到目标单元格
		const tableRows = this.tableEl?.querySelectorAll("tr");
		const targetRowIndex = row === 0 ? 1 : row + 1;
		if (tableRows && targetRowIndex < tableRows.length) {
			const targetRow = tableRows[targetRowIndex];
			const cells = targetRow.querySelectorAll("td, th");
			const targetCellIndex = col + 1;
			if (targetCellIndex < cells.length) {
				const targetCell = cells[targetCellIndex];
				const input = targetCell.querySelector("input") as HTMLInputElement;
				if (input) {
					input.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
					setTimeout(() => {
						input.focus();
						input.select();
						if (input.parentElement) {
							input.parentElement.classList.add("csv-search-current");
							setTimeout(() => {
								if (input.parentElement) {
									input.parentElement.classList.remove("csv-search-current");
								}
							}, 3000);
						}
					}, 100);
				}
			}
		}
	}

	// 新增：清除搜索高亮
	private clearSearchHighlights() {
		this.tableEl?.querySelectorAll(".csv-search-current").forEach(el => {
			if (el instanceof HTMLElement) {
				el.classList.remove("csv-search-current");
			}
		});
	}

	// 新增：源码模式切换
	async openSourceMode() {
		const file = this.file;
		if (!file) return;
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.openFile(file, { active: true, state: { mode: "source" } });
		await leaf.setViewState({
			type: "csv-source-view",
			active: true,
			state: { file: file.path }
		});
		this.leaf.detach(); // 新增：切换后关闭当前 leaf
	}

	// 新增：移动行/列方法
	moveRow(fromIndex: number, toIndex: number) {
		if (fromIndex < 0 || toIndex < 0 || fromIndex >= this.tableData.length || toIndex >= this.tableData.length) return;
		this.saveSnapshot();
		const row = this.tableData.splice(fromIndex, 1)[0];
		this.tableData.splice(toIndex, 0, row);
		this.refresh();
		this.requestSave();
	}

	// 新增：切换行固定状态
	private toggleRowSticky(rowIndex: number) {
		if (this.stickyRows.has(rowIndex)) {
			this.stickyRows.delete(rowIndex);
		} else {
			this.stickyRows.add(rowIndex);
		}
		this.applyStickyStyles();
	}

	// 新增：切换列固定状态
	private toggleColumnSticky(colIndex: number) {
		if (this.stickyColumns.has(colIndex)) {
			this.stickyColumns.delete(colIndex);
		} else {
			this.stickyColumns.add(colIndex);
		}
		this.applyStickyStyles();
	}

	// 新增：应用sticky样式
	private applyStickyStyles() {
		if (!this.tableEl) return;

		// 移除所有现有的sticky类
		this.tableEl.querySelectorAll('.csv-sticky-row, .csv-sticky-col').forEach(el => {
			el.classList.remove('csv-sticky-row', 'csv-sticky-col');
		});

		// 应用固定行样式
		this.stickyRows.forEach(rowIndex => {
			// 表头行（列标题行）
			if (rowIndex === -1) {
				const headerCells = this.tableEl.querySelectorAll('thead tr th');
				headerCells.forEach(cell => cell.classList.add('csv-sticky-row'));
			} else {
				// 数据行（在tbody中，从第1个tr开始）
				const rowCells = this.tableEl.querySelectorAll(`tbody tr:nth-child(${rowIndex + 1}) td`);
				rowCells.forEach(cell => cell.classList.add('csv-sticky-row'));
			}
		});

		// 应用固定列样式  
		this.stickyColumns.forEach(colIndex => {
			// 列头（在thead中）
			const headerCell = this.tableEl.querySelector(`thead tr th:nth-child(${colIndex + 2})`);
			if (headerCell) headerCell.classList.add('csv-sticky-col');
			
			// 数据列（在tbody的所有行中）
			const dataCells = this.tableEl.querySelectorAll(`tbody tr td:nth-child(${colIndex + 2})`);
			dataCells.forEach(cell => cell.classList.add('csv-sticky-col'));
		});

		console.log('Applied sticky styles:', {
			stickyRows: Array.from(this.stickyRows),
			stickyColumns: Array.from(this.stickyColumns)
		});
	}
	moveCol(fromIndex: number, toIndex: number) {
		if (fromIndex < 0 || toIndex < 0 || fromIndex >= this.tableData[0].length || toIndex >= this.tableData[0].length) return;
		this.saveSnapshot();
		this.tableData.forEach(row => {
			const col = row.splice(fromIndex, 1)[0];
			row.splice(toIndex, 0, col);
		});
		this.refresh();
		this.requestSave();
	}

	// 右键菜单专用插入/删除行列方法，带快照和保存
	private refreshInsertRow(rowIdx: number, after: boolean) {
		this.saveSnapshot();
		const idx = after ? rowIdx + 1 : rowIdx;
		this.tableData.splice(idx, 0, Array(this.tableData[0].length).fill(""));
		this.refresh();
		this.requestSave();
	}
	private refreshDeleteRow(rowIdx: number) {
		if (this.tableData.length <= 1) return;
		this.saveSnapshot();
		this.tableData.splice(rowIdx, 1);
		this.refresh();
		this.requestSave();
	}
	private refreshInsertCol(colIdx: number, after: boolean) {
		this.saveSnapshot();
		const idx = after ? colIdx + 1 : colIdx;
		this.tableData.forEach(row => row.splice(idx, 0, ""));
		this.refresh();
		this.requestSave();
	}
	private refreshDeleteCol(colIdx: number) {
		if (this.tableData[0].length <= 1) return;
		this.saveSnapshot();
		this.tableData.forEach(row => row.splice(colIdx, 1));
		this.refresh();
		this.requestSave();
	}
}
