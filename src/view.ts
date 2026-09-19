import {
	TextFileView,
	ButtonComponent,
	Notice,
	DropdownComponent,
	IconName,
	Setting,
	TFile,
	WorkspaceLeaf,
	setIcon,
} from "obsidian";
import { CSVUtils } from "./utils/csv-utils";
import { TableHistoryManager } from "./utils/history-manager";
import { TableUtils } from "./utils/table-utils";
import { FileUtils } from "./utils/file-utils";
import { i18n } from "./i18n"; // 修正导入路径
import { renderEditBar } from "./view/edit-bar";
import { SearchBar } from "./view/search-bar";
import { renderTable, renderCellDisplay } from "./view/table-render";
import { HighlightManager } from "./utils/highlight-manager";
import { setupHeaderContextMenu } from "./view/header-context-menu";
import { isSearchShortcut } from "./utils/keyboard-utils";
import { computeVirtualWindow, offsetVirtualWindow } from "./utils/virtual-window";

export const VIEW_TYPE_CSV = "csv-lite-view";

// A2（issue #51）：行数超过阈值才启用虚拟化；小文件全量渲染，行为不变。
const VIRTUAL_THRESHOLD = 150;
// 可视区上下各多渲染几行，避免快速滚动露白。
const VIRTUAL_OVERSCAN = 8;

/** 主插件在视图侧用到的接口（避免 any） */
interface CsvLitePluginApi {
	settings?: { preferredDelimiter?: string };
	saveSettings?: () => Promise<void>;
	isHeaderRowEnabled?: (path: string) => boolean;
	setHeaderRowEnabled?: (path: string, enabled: boolean) => Promise<void>;
}

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

	// 新增：解析器设置状态
	private delimiter: string = 'auto';
	private quoteChar: string = '"';
	// 保存文件原始分隔符（用于非破坏性编辑后保存仍保持原始格式）
	private originalFileDelimiter: string | null = null;
	// 保存文件原始换行风格与结尾换行，确保「只是查看」也不改格式（issue #52）
	private originalFileNewline: string = "\n";
	private originalTrailingNewline: string = "";

	// 编辑栏
	private editBarEl: HTMLElement;
	private editInput: HTMLInputElement;
	private activeCellEl: HTMLInputElement | null = null;

	// A1（issue #51）：单元格编辑改用**一个共享的 <input>**，
	// 编辑时移动到目标 <td> 里；平时隐藏并放在 holder 中。
	private cellInput: HTMLInputElement;
	private cellEditorHolder: HTMLElement;
	private editingRow: number = -1;
	private editingCol: number = -1;
	private editingOriginalValue: string = "";
	private editSnapshotTaken: boolean = false;
	private activeCellTd: HTMLElement | null = null;

	// A2（issue #51）：行虚拟化状态
	private rowHeight: number = 24;
	private virtualStart = 0;
	private virtualEnd = 0;
	private virtualRafId = 0;
	private warnedVirtualDisabled = false;
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

	// 新增：搜索栏属性
	private searchBar: SearchBar | null = null;

	// 新增：header context menu 解绑函数
	private headerContextMenuCleanup: (() => void) | null = null;

	// 表格容器的点击处理器（刷新时替换，避免在 this 上挂 expando）
	private tableClickHandler: ((e: MouseEvent) => void) | null = null;

	// 新增：固定行列功能
	private stickyRows: Set<number> = new Set();
	private stickyColumns: Set<number> = new Set();
	private stickyHeaders: boolean = true; // 表头默认固定
	private stickyRowNumbers: boolean = true; // 行号默认固定

	// issue #39：首行为表头（纯视图层开关，按文件持久化在插件 data.json）
	private firstRowAsHeader: boolean = false;
	private headerToggleButton: ButtonComponent | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		this.historyManager = new TableHistoryManager(
			undefined,
			this.maxHistorySize
		);
		// headerEl 未包含在公开类型里，但运行时由 Obsidian 提供
		this.headerEl = (this as unknown as { headerEl: HTMLElement }).headerEl;
		// Setup safe save method with retry logic
		this.setupSafeSave();
	}

	getIcon(): IconName {
		return "table";
	}
	getViewData() {
		// 使用原始文件分隔符（如果已检测到），否则使用当前解析器的实际分隔符
		const delim = this.originalFileDelimiter || (this.delimiter === 'auto' ? undefined : this.delimiter);
		const config: { newline?: string; delimiter?: string } = { newline: this.originalFileNewline };
		if (delim) config.delimiter = delim;
		const body = CSVUtils.unparseCSV(this.tableData, config);
		// 原样补回文件结尾的换行，避免丢失结尾换行或产生幽灵空行（issue #52）
		return body + this.originalTrailingNewline;
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
		this.requestSave = () => {
			// Use our retry utility to handle file busy errors
			FileUtils.withRetry(async () => {
				// Call the original requestSave method
				this.originalRequestSave();
				return Promise.resolve();
			}).catch((error) => {
				console.error("Failed to save CSV file after retries:", error);
				new Notice(
					`Failed to save file: ${error.message}. The file might be open in another program.`
				);
			});
		};
	}

	setViewData(data: string, clear: boolean) {
		try {
			// 每个文件独立记住「首行为表头」状态（issue #39）
			this.loadHeaderRowPreference();

			// 使用新的分隔符设置解析CSV数据
			this.tableData = CSVUtils.parseCSV(data, {
				delimiter: this.delimiter,
				quoteChar: this.quoteChar,
			});

			// 记录原始换行风格与结尾换行，并在内存中移除解析器为结尾换行补出的
			// 幽灵空行；保存时由 getViewData 原样补回（issue #52）
			this.originalFileNewline = CSVUtils.detectNewline(data);
			const trailing = CSVUtils.getTrailingNewline(data);
			this.originalTrailingNewline = trailing.newline;
			this.tableData = CSVUtils.dropTrailingRows(
				this.tableData,
				trailing.rowCount
			);

			// 初次或在未设置 originalFileDelimiter 时检测并缓存原始分隔符
			if (!this.originalFileDelimiter) {
				try {
					this.originalFileDelimiter = CSVUtils.detectDelimiter(data, this.quoteChar);
				} catch (e) {
					console.warn('Failed to detect original delimiter:', e);
				}
			}

			// 确保至少有一行一列
			if (!this.tableData || this.tableData.length === 0) {
				this.tableData = [[""]];
			}

			// 使所有行的列数一致
			this.tableData = CSVUtils.normalizeTableData(this.tableData);

			// 自动列宽：换文件 / 列数变化（例如换分隔符）时清空列宽，
			// 让 renderTable 重新按内容估算，无需手动点「重置列宽」。
			// （以前 onOpen 的占位渲染会先把 columnWidths 填成 [100]，
			//  导致真实数据加载时不再重算。）
			const columnCount = this.tableData[0]?.length || 0;
			if (clear || this.columnWidths.length !== columnCount) {
				this.columnWidths = [];
			}

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

		// renderTable 会清空 tableEl；先把共享编辑器收回来，避免它被一并删掉（issue #51）
		this.detachCellEditor();

		// Safety check: ensure tableData is initialized
		if (!this.tableData || !Array.isArray(this.tableData) || this.tableData.length === 0) {
			console.warn("Table data not properly initialized, setting default");
			this.tableData = [[""]];
		}

		// 恢复原有表格渲染方式
		renderTable({
			tableData: this.tableData,
			columnWidths: this.columnWidths,
			tableEl: this.tableEl,
			requestSave: () => this.requestSave(),
			onEditCell: (row, col) => this.beginCellEdit(row, col),
			onEditHeader: (col) => this.beginCellEdit(0, col),
			virtualWindow: this.buildVirtualWindow(),
			firstRowAsHeader: this.firstRowAsHeader,
			selectRow: (rowIndex) => this.highlightManager.selectRow(rowIndex),
			selectColumn: (colIndex) => this.highlightManager.selectColumn(colIndex),
			getColumnLabel: (index) => this.getColumnLabel(index),
			setupColumnResize: (handle, columnIndex) => this.setupColumnResize(handle, columnIndex),
			insertRowAt: (rowIndex, after = false) => {
				this.saveSnapshot();
				// 表头模式下不允许在表头行上方插行（issue #39）
				const idx = Math.max(after ? rowIndex + 1 : rowIndex, this.getHeaderRowOffset());
				this.tableData.splice(idx, 0, Array(this.tableData[0].length).fill(""));
				this.refresh();
				this.requestSave();
			},
			deleteRowAt: (rowIndex) => {
				if (this.tableData.length <= 1) return;
				if (this.isProtectedHeaderRow(rowIndex)) {
					new Notice(i18n.t("notifications.headerRowProtected"));
					return;
				}
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
			// 新增：表格单元格编辑时同步编辑栏（已移到共享编辑器处理）
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

		this.updateHeaderToggleButton();

		// 延迟应用sticky样式，确保DOM已完全渲染
		window.requestAnimationFrame(() => {
			this.applyStickyStyles();
			this.measureRowHeight();
		});

		// 在完成表格渲染后，更新滚动条容器的宽度
		// 现在topScrollContainer在operationEl下方
		const topScroll = this.operationEl?.querySelector?.('.top-scroll');
		if (topScroll && this.tableEl) {
			const tableWidth = this.tableEl.offsetWidth;
			topScroll.empty();
			const spacer = topScroll.createDiv();
			spacer.setCssStyles({ width: tableWidth + 'px', height: '1px' });
		}

		// 新增：每次刷新后为表格父容器绑定点击事件，点击非头部区域时清除高亮
		const tableContainer = this.tableEl.parentElement;
		if (tableContainer) {
			if (this.tableClickHandler) {
				tableContainer.removeEventListener('click', this.tableClickHandler);
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
			this.tableClickHandler = handler;
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

	// ================= issue #39：首行为表头 =================

	private getMainPlugin(): CsvLitePluginApi | null {
		try {
			const app = this.app as unknown as {
				plugins?: { getPlugin?: (id: string) => CsvLitePluginApi };
			};
			return app.plugins?.getPlugin?.('csv-lite') ?? null;
		} catch {
			return null;
		}
	}

	/** 从插件设置里读取当前文件的表头模式偏好 */
	private loadHeaderRowPreference() {
		const path = this.file?.path;
		const plugin = this.getMainPlugin();
		this.firstRowAsHeader = !!(path && plugin?.isHeaderRowEnabled?.(path));
	}

	/** 表头模式下数据行从第 1 行开始（第 0 行渲染在 thead 里） */
	private getHeaderRowOffset(): number {
		return this.firstRowAsHeader ? 1 : 0;
	}

	/** 切换「首行为表头」：只改视图，不写回文件 */
	private toggleFirstRowAsHeader() {
		// 先结束正在进行的编辑，再切换渲染方式
		if (this.editingRow >= 0) this.commitCellEdit();
		this.firstRowAsHeader = !this.firstRowAsHeader;
		const path = this.file?.path;
		const plugin = this.getMainPlugin();
		if (path && plugin?.setHeaderRowEnabled) {
			Promise.resolve(plugin.setHeaderRowEnabled(path, this.firstRowAsHeader)).catch(
				(e) => console.warn('Failed to persist header row setting:', e)
			);
		}
		this.updateHeaderToggleButton();
		this.refresh();
	}

	private updateHeaderToggleButton() {
		const el = this.headerToggleButton?.buttonEl;
		if (!el) return;
		el.classList.toggle('is-active', this.firstRowAsHeader);
		el.setAttribute('aria-pressed', String(this.firstRowAsHeader));
		el.title = i18n.t(
			this.firstRowAsHeader ? 'buttons.toggleHeaderRowOff' : 'buttons.toggleHeaderRowOn'
		);
	}

	// 设置活动单元格
	private setActiveCell(
		rowIndex: number,
		colIndex: number,
		td: HTMLElement | null
	) {
		// 移除之前单元格的高亮
		if (this.activeCellTd) {
			this.activeCellTd.classList.remove("csv-active-cell");
		}

		// 设置新的活动单元格
		this.activeRowIndex = rowIndex;
		this.activeColIndex = colIndex;
		this.activeCellTd = td;
		this.activeCellEl = this.cellInput || null;

		// 高亮当前单元格
		if (td) {
			td.classList.add("csv-active-cell");
		}

		// 更新编辑栏内容
		if (this.editInput && this.editBarEl) {
			renderEditBar({
				editBarEl: this.editBarEl,
				editInput: this.editInput,
				activeCellEl: this.cellInput || null,
				activeRowIndex: rowIndex,
				activeColIndex: colIndex,
				tableData: this.tableData,
				onEdit: (row, col, value) => {
					this.saveSnapshot();
					this.tableData[row][col] = value;
					// 若正在编辑同一格，同步共享输入框
					if (this.editingRow === row && this.editingCol === col) {
						this.cellInput.value = value;
					}
					this.updateCellDisplay(row, col);
					this.requestSave();
				},
			});
		}
	}

	// ================= A1：共享单元格编辑器（issue #51） =================

	/**
	 * 共享编辑器的输入/键盘/失焦处理。只绑定一次。
	 */
	private setupSharedCellEditor() {
		// 输入时即时写回（保持与旧行为一致），但一次编辑会话只存一次快照
		this.registerDomEvent(this.cellInput, "input", () => {
			if (this.editingRow < 0 || this.editingCol < 0) return;
			if (!this.editSnapshotTaken) {
				this.saveSnapshot();
				this.editSnapshotTaken = true;
			}
			this.tableData[this.editingRow][this.editingCol] = this.cellInput.value;
			if (this.editInput) this.editInput.value = this.cellInput.value;
			this.requestSave();
		});

		this.registerDomEvent(this.cellInput, "keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				this.commitCellEdit();
				this.moveEdit(1, 0);
			} else if (e.key === "Escape") {
				e.preventDefault();
				this.cancelCellEdit();
			} else if (e.key === "Tab") {
				e.preventDefault();
				const dCol = e.shiftKey ? -1 : 1;
				this.commitCellEdit();
				this.moveEdit(0, dCol);
			}
		});

		// 失焦即提交（点击到别处）；若随后又开始了新的单元格编辑则不重复提交
		this.registerDomEvent(this.cellInput, "blur", () => {
			window.setTimeout(() => {
				if (document.activeElement !== this.cellInput) {
					this.commitCellEdit();
				}
			}, 0);
		});
	}

	/**
	 * 单元格点击用事件委托，整个表格只挂一个监听器（以前是每格一套 handler）。
	 */
	private setupCellDelegation() {
		this.registerDomEvent(this.tableEl, "click", (e: MouseEvent) => {
			const target = e.target as HTMLElement | null;
			// 链接自己处理点击（打开 URL）
			if (target?.closest("a")) return;
			// 点击正在编辑的共享输入框（挪动光标）不要重新开始编辑
			if (target?.closest(".csv-cell-input-shared")) return;
			const td = target?.closest("td.csv-cell") as HTMLElement | null;
			if (!td) return;
			const row = Number(td.dataset.row);
			const col = Number(td.dataset.col);
			if (Number.isNaN(row) || Number.isNaN(col)) return;
			this.beginCellEdit(row, col);
		});
	}

	/** 根据行列号找到对应的单元格（用 data-row，兼容虚拟化；表头行在 thead 里） */
	private getCellTd(row: number, col: number): HTMLElement | null {
		// issue #39：表头模式下第 0 行渲染在 thead
		if (this.firstRowAsHeader && row === 0) {
			return (
				this.tableEl?.querySelector<HTMLElement>(
					`thead tr th:nth-child(${col + 2})`
				) || null
			);
		}
		const tr = this.tableEl?.querySelector(`tbody tr[data-row="${row}"]`);
		if (!tr) return null;
		const cells = tr.querySelectorAll("td");
		// cells[0] 是行号列，数据列从 1 开始
		return cells[col + 1] || null;
	}

	// ================= A2：行虚拟化（issue #51） =================

	private getScrollContainer(): HTMLElement | null {
		// 优先找真正能纵向滚动的祖先，否则退回最近一个 overflow:auto/scroll 的祖先
		let el: HTMLElement | null = this.tableEl?.parentElement || null;
		let fallback: HTMLElement | null = null;
		while (el && el !== document.body) {
			const oy = window.getComputedStyle(el).overflowY;
			if (oy === "auto" || oy === "scroll") {
				if (!fallback) fallback = el;
				if (el.scrollHeight > el.clientHeight + 1) return el;
			}
			el = el.parentElement;
		}
		return fallback || this.contentEl || null;
	}

	/**
	 * 表格体已经被滚过去多少像素。
	 * 不直接拿 scrollTop，是因为滚动容器未必以表格为起点
	 * （.view-content 上方还有工具栏、编辑栏等）。
	 */
	private getScrolledOffset(scroller: HTMLElement): number {
		const tbody = this.tableEl?.querySelector("tbody");
		if (!tbody) return 0;
		const rect = scroller.getBoundingClientRect();
		const tbodyTop = tbody.getBoundingClientRect().top;
		return Math.max(0, rect.top - tbodyTop);
	}

	/** tbody 里的数据行数（表头模式下第 0 行在 thead，不参与滚动，issue #39） */
	private getBodyRowCount(): number {
		return Math.max(0, this.tableData.length - this.getHeaderRowOffset());
	}

	/** 当前是否应对这张表启用虚拟化 */
	private isVirtualizable(): boolean {
		return (
			this.getBodyRowCount() > VIRTUAL_THRESHOLD && this.stickyRows.size === 0
		);
	}

	/** 根据当前滚动位置算出要渲染的行窗口 */
	private buildVirtualWindow() {
		const offset = this.getHeaderRowOffset();
		const rows = this.getBodyRowCount();
		if (!this.isVirtualizable()) {
			if (
				rows > VIRTUAL_THRESHOLD &&
				this.stickyRows.size > 0 &&
				!this.warnedVirtualDisabled
			) {
				this.warnedVirtualDisabled = true;
				new Notice(i18n.t("notifications.virtualDisabledBySticky"));
			}
			this.virtualStart = offset;
			this.virtualEnd = this.tableData.length;
			return { start: offset, end: this.tableData.length, topPad: 0, bottomPad: 0 };
		}
		const scroller = this.getScrollContainer();
		const w = offsetVirtualWindow(
			computeVirtualWindow(
				rows,
				this.rowHeight,
				scroller ? this.getScrolledOffset(scroller) : 0,
				scroller ? scroller.clientHeight : 800,
				VIRTUAL_OVERSCAN
			),
			offset
		);
		this.virtualStart = w.start;
		this.virtualEnd = w.end;
		return w;
	}

	/** 滚动时（rAF 合并）重算窗口，变化才重渲染 */
	private onVirtualScroll() {
		if (!this.isVirtualizable()) return;
		if (this.virtualRafId) return;
		this.virtualRafId = window.requestAnimationFrame(() => {
			this.virtualRafId = 0;
			const scroller = this.getScrollContainer();
			if (!scroller) return;
			const offset = this.getHeaderRowOffset();
			const w = offsetVirtualWindow(
				computeVirtualWindow(
					this.getBodyRowCount(),
					this.rowHeight,
					this.getScrolledOffset(scroller),
					scroller.clientHeight,
					VIRTUAL_OVERSCAN
				),
				offset
			);
			if (w.start === this.virtualStart && w.end === this.virtualEnd) return;
			// 编辑器可能正在被移除的行里，先提交
			if (this.editingRow >= 0) this.commitCellEdit();
			this.virtualStart = w.start;
			this.virtualEnd = w.end;
			this.refresh();
		});
	}

	/** 确保指定行在当前渲染窗口内（虚拟化下搜索跳转用） */
	private ensureRowRendered(row: number) {
		const offset = this.getHeaderRowOffset();
		// 表头行始终在 thead 里，不需要滚动
		if (row < offset) return;
		if (!this.isVirtualizable()) return;
		if (row >= this.virtualStart && row < this.virtualEnd) return;
		const scroller = this.getScrollContainer();
		if (scroller) {
			const viewport = scroller.clientHeight || 600;
			const target = Math.max(
				0,
				(row - offset) * this.rowHeight - Math.floor(viewport / 2)
			);
			const delta = target - this.getScrolledOffset(scroller);
			scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
		}
		this.virtualStart = -1;
		this.virtualEnd = -1;
		this.refresh();
	}

	/** 量一下真实行高，让 spacer 高度与渲染行一致 */
	private measureRowHeight() {
		if (!this.isVirtualizable()) return;
		const firstRow = this.tableEl?.querySelector<HTMLElement>(
			"tbody tr.csv-data-row"
		);
		if (firstRow && firstRow.offsetHeight > 0) {
			this.rowHeight = firstRow.offsetHeight;
		}
	}

	/** 进入单元格编辑：把共享 input 移进 <td> 并聚焦 */
	private beginCellEdit(row: number, col: number) {
		if (row < 0 || col < 0) return;
		if (!this.tableData[row] || col >= this.tableData[row].length) return;

		// 已在编辑另一格时先提交
		if (
			this.editingRow >= 0 &&
			(this.editingRow !== row || this.editingCol !== col)
		) {
			this.commitCellEdit();
		}

		const td = this.getCellTd(row, col);
		if (!td) return;

		this.editingRow = row;
		this.editingCol = col;
		this.editingOriginalValue = this.tableData[row][col];
		this.editSnapshotTaken = false;

		if (this.firstRowAsHeader && row === 0) {
			// 编辑表头：先把列名文字层藏起来（issue #39）
			td.querySelectorAll(".csv-col-letter, .csv-header-text").forEach((el) => {
				(el as HTMLElement).setCssStyles({ display: "none" });
			});
		} else {
			const display = td.querySelector<HTMLElement>(".csv-cell-display");
			if (display) display.setCssStyles({ display: "none" });
		}

		td.appendChild(this.cellInput);
		this.cellInput.setCssStyles({ display: "block" });
		this.cellInput.value = this.editingOriginalValue;
		this.setActiveCell(row, col, td);
		this.cellInput.focus();
		const len = this.cellInput.value.length;
		this.cellInput.setSelectionRange(len, len);
	}

	/** 提交当前编辑：值已在 input 事件里写回，这里只收尾并刷新显示层 */
	private commitCellEdit() {
		if (this.editingRow < 0 || this.editingCol < 0) return;
		const row = this.editingRow;
		const col = this.editingCol;
		this.tableData[row][col] = this.cellInput.value;
		this.editingRow = -1;
		this.editingCol = -1;
		this.editSnapshotTaken = false;
		this.detachCellEditor();
		this.updateCellDisplay(row, col);
		this.requestSave();
	}

	/** 取消当前编辑（Escape）：恢复原值 */
	private cancelCellEdit() {
		if (this.editingRow < 0 || this.editingCol < 0) return;
		const row = this.editingRow;
		const col = this.editingCol;
		this.tableData[row][col] = this.editingOriginalValue;
		this.editingRow = -1;
		this.editingCol = -1;
		this.editSnapshotTaken = false;
		this.detachCellEditor();
		this.updateCellDisplay(row, col);
		if (this.editInput) this.editInput.value = this.editingOriginalValue;
	}

	/** 提交后把编辑器移回 holder 并隐藏 */
	private detachCellEditor() {
		if (this.cellInput) {
			this.cellInput.setCssStyles({ display: "none" });
			this.cellEditorHolder?.appendChild(this.cellInput);
		}
	}

	/** Enter/Tab 提交后移动到相邻单元格继续编辑 */
	private moveEdit(dRow: number, dCol: number) {
		const row = this.activeRowIndex >= 0 ? this.activeRowIndex : 0;
		const col = this.activeColIndex >= 0 ? this.activeColIndex : 0;
		// 在表头行里按 Tab 横向移动时不要掉进数据区（issue #39）
		const minRow =
			this.firstRowAsHeader && row === 0 ? 0 : this.getHeaderRowOffset();
		const maxRow = Math.max(0, this.tableData.length - 1);
		const maxCol = Math.max(0, (this.tableData[0]?.length || 1) - 1);
		const nextRow = Math.min(Math.max(row + dRow, minRow), maxRow);
		const nextCol = Math.min(Math.max(col + dCol, 0), maxCol);
		this.beginCellEdit(nextRow, nextCol);
	}

	/** 刷新单个单元格的显示层（编辑提交后 / 编辑栏改动后） */
	private updateCellDisplay(row: number, col: number) {
		if (this.editingRow === row && this.editingCol === col) return;
		// 表头行在 thead 里，刷新方式不同（issue #39）
		if (this.firstRowAsHeader && row === 0) {
			this.updateHeaderCellDisplay(col);
			return;
		}
		const td = this.getCellTd(row, col);
		if (!td || !this.tableData[row]) return;
		renderCellDisplay(td, this.tableData[row][col], () =>
			this.beginCellEdit(row, col)
		);
	}

	/** 编辑提交后刷新 thead 里的表头文本（issue #39） */
	private updateHeaderCellDisplay(col: number) {
		const th = this.getCellTd(0, col);
		if (!th || !this.tableData[0]) return;
		const text = this.tableData[0][col] ?? "";
		const letter = th.querySelector<HTMLElement>(".csv-col-letter");
		if (letter) letter.setCssStyles({ display: "" });
		let textEl = th.querySelector<HTMLElement>(".csv-header-text");
		if (!text) {
			if (textEl) textEl.remove();
		} else {
			if (!textEl) {
				textEl = th.createSpan({ cls: "csv-header-text" });
				if (letter) th.insertBefore(textEl, letter.nextSibling);
			}
			// 编辑时文字层被隐藏过，提交后要恢复显示
			textEl.setCssStyles({ display: "" });
			textEl.textContent = text;
			textEl.title = text;
		}
		th.title = text
			? `${this.getColumnLabel(col)}: ${text}`
			: this.getColumnLabel(col);
	}

	// 设置列宽调整功能
	private setupColumnResize(handle: HTMLElement, columnIndex: number) {
		let startX: number;
		let startWidth: number;
		// 拖拽前缓存该列的所有单元格，拖动时只改它们的宽度，
		// 避免像以前那样每个 mousemove 都 this.refresh() 重建整张表（issue #51）
		let affectedCells: HTMLElement[] = [];

		const onMouseDown = (e: MouseEvent) => {
			startX = e.clientX;
			startWidth = this.columnWidths[columnIndex] || 100;
			// nth-child 从 1 开始，第 1 列是行号列，所以目标列是 columnIndex + 2
			const selector = `thead tr th:nth-child(${columnIndex + 2}), tbody tr.csv-data-row td:nth-child(${columnIndex + 2})`;
			affectedCells = Array.from(
				this.tableEl?.querySelectorAll<HTMLElement>(selector) || []
			);

			document.addEventListener("mousemove", onMouseMove);
			document.addEventListener("mouseup", onMouseUp);

			e.preventDefault();
		};

		const onMouseMove = (e: MouseEvent) => {
			const width = startWidth + (e.clientX - startX);
			if (width >= 50) {
				// 最小宽度限制
				this.columnWidths[columnIndex] = width;
				for (const cell of affectedCells) {
					cell.setCssStyles({ width: `${width}px` });
				}
			}
		};

		const onMouseUp = () => {
			document.removeEventListener("mousemove", onMouseMove);
			document.removeEventListener("mouseup", onMouseUp);
			affectedCells = [];
			// 列宽变化会影响 sticky 列/行号的偏移量，收尾时重算一次
			this.applyStickyStyles();
		};

		handle.addEventListener("mousedown", onMouseDown);
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
			// - 点击时遍历所有 leaf，查找同一文件的目标视图（csv-lite-source-view）。
			//   - 若有，则激活该 leaf（workspace.setActiveLeaf）。
			//   - 若无，则新建 leaf 并打开目标视图。
			// - 不主动关闭原有视图，用户可自行关闭。
			const actionsEl = this.headerEl?.querySelector?.('.view-actions');
			if (actionsEl && !actionsEl.querySelector('.csv-switch-source')) {
				const btn = actionsEl.createEl('button', {
					cls: 'clickable-icon csv-switch-source',
					attr: { 'aria-label': '切换到源码模式' },
				});
				setIcon(btn, 'file-code');
				btn.onclick = async () => {
					const file = this.file;
					if (!file) return;
					const leaves = this.app.workspace.getLeavesOfType('csv-lite-source-view');
					let found = false;
					for (const leaf of leaves) {
						const viewFile = (leaf.view as TextFileView | null)?.file;
						if (viewFile && viewFile.path === file.path) {
							this.app.workspace.setActiveLeaf(leaf, { focus: true });
							found = true;
							break;
						}
					}
					if (!found) {
						const newLeaf = this.app.workspace.getLeaf(true);
						await newLeaf.openFile(file, { active: true, state: { mode: "source" } });
						await newLeaf.setViewState({
							type: "csv-lite-source-view",
							active: true,
							state: { file: file.path }
						});
						this.app.workspace.setActiveLeaf(newLeaf, { focus: true });
					}
				};
			}

			// Clear the content element first
			this.contentEl.empty();

			// 创建操作区
			this.operationEl = this.contentEl.createDiv({
				cls: "csv-operations",
			});

			// 新增：解析器设置UI
			const parserSettingsEl = this.operationEl.createDiv({
				cls: "csv-parser-settings",
			});

			// 分隔符选择：下拉（Auto, comma, semicolon）
			new Setting(parserSettingsEl)
				.setName(i18n.t("settings.fieldSeparator"))
				.setDesc(i18n.t("settings.fieldSeparatorDesc"))
				.addDropdown((dropdown: DropdownComponent) => {
					// 初始值：优先使用主插件的全局偏好
					try {
						const mainPlugin = this.getMainPlugin();
						if (mainPlugin && mainPlugin.settings && mainPlugin.settings.preferredDelimiter) {
							this.delimiter = mainPlugin.settings.preferredDelimiter;
						}
					} catch { /* 插件不可用时忽略 */ }

					// 检测当前文件的分隔符（用于在 Auto 模式下显示检测结果）
					const detected = CSVUtils.detectDelimiter(this.data || '', this.quoteChar);

					dropdown.addOption('auto', `Auto (detected: ${detected})`);
					dropdown.addOption(',', ',');
					dropdown.addOption(';', ';');
					// set initial
					dropdown.setValue(this.delimiter || 'auto');

					dropdown.onChange(async (value) => {
						this.delimiter = value === '\\t' ? '\t' : value;
						// 保存全局偏好（如果主插件可用）
						try {
							const mainPlugin = this.getMainPlugin();
							if (mainPlugin && typeof mainPlugin.saveSettings === 'function') {
								mainPlugin.settings = { ...(mainPlugin.settings || {}), preferredDelimiter: this.delimiter };
								await mainPlugin.saveSettings();
							}
						} catch { /* 插件不可用时忽略 */ }

						 // 非破坏性：仅重新解析视图，不写回文件
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
			const buttonContainer = this.operationEl.createDiv({
				cls: "csv-operation-buttons",
			});
			// 按钮组（左侧）
			const buttonsGroup = buttonContainer.createDiv({
				cls: "csv-buttons-group"
			});
			// 搜索栏（右侧）
			const searchBarContainer = buttonContainer.createDiv({
				cls: "csv-search-bar-container"
			});
			this.searchBar = new SearchBar(searchBarContainer, {
				getTableData: () => this.tableData,
				tableEl: this.tableEl,
				getColumnLabel: (index: number) => this.getColumnLabel(index),
				getCellAddress: (row: number, col: number) => this.getCellAddress(row, col),
				jumpToCell: (row: number, col: number) => this.jumpToCell(row, col),
				clearSearchHighlights: () => this.clearSearchHighlights(),
				getStartRow: () => this.getHeaderRowOffset(),
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

			// 首行为表头开关（issue #39）：只影响视图，按文件记住
			this.headerToggleButton = new ButtonComponent(buttonsGroup)
				.setButtonText(i18n.t("buttons.toggleHeaderRow"))
				.setIcon("heading")
				.onClick(() => this.toggleFirstRowAsHeader());
			this.headerToggleButton.buttonEl.classList.add("csv-header-toggle");
			this.updateHeaderToggleButton();

			// 紧凑型：分隔符下拉（放在重置按钮旁，便于快速切换），使用简短的Label
			const delimiterContainer = buttonsGroup.createDiv({ cls: 'csv-delimiter-compact' });
			new Setting(delimiterContainer)
				.addDropdown((dropdown: DropdownComponent) => {
					// 初始化值（与 parser settings 保持一致）
					try {
						const mainPlugin = this.getMainPlugin();
						if (mainPlugin && mainPlugin.settings && mainPlugin.settings.preferredDelimiter) {
							this.delimiter = mainPlugin.settings.preferredDelimiter;
						}
					} catch { /* 插件不可用时忽略 */ }

					const detected = CSVUtils.detectDelimiter(this.data || '', this.quoteChar);
					dropdown.addOption('auto', `Auto (${detected})`);
					dropdown.addOption(',', ',');
					dropdown.addOption(';', ';');
					dropdown.setValue(this.delimiter || 'auto');

					dropdown.onChange(async (value) => {
						this.delimiter = value === '\\t' ? '\t' : value;
						// 保存偏好
						try {
							const mainPlugin = this.getMainPlugin();
							if (mainPlugin && typeof mainPlugin.saveSettings === 'function') {
								mainPlugin.settings = { ...(mainPlugin.settings || {}), preferredDelimiter: this.delimiter };
								await mainPlugin.saveSettings();
							}
						} catch { /* 插件不可用时忽略 */ }

						 // 非破坏性：仅重新解析视图
						 this.reparseAndRefresh();
					});
				});



			// 编辑栏（sticky工具栏内，按钮和搜索栏之后）
			this.editBarEl = this.operationEl.createDiv({
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
			const topScrollContainer = this.operationEl.createDiv({
				cls: "scroll-container top-scroll",
			});

			// 创建表格区域 - 移除顶部滚动条
			const tableWrapper = this.contentEl.createDiv({
				cls: "table-wrapper",
			});
			// 主表格容器
			const tableContainer = tableWrapper.createDiv({
				cls: "table-container main-scroll",
			});
			this.tableEl = tableContainer.createEl("table", {
				cls: "csv-lite-table",
			});
			// 初始化高亮管理器
			this.highlightManager = new HighlightManager(this.tableEl);

			// 设置滚动同步（传递新的topScrollContainer）
			this.setupScrollSync(topScrollContainer, tableContainer);

			// A1（issue #51）：只创建一个共享的单元格编辑器，
			// 编辑时临时移入目标 <td>，避免每格一个 <input>。
			this.cellEditorHolder = this.contentEl.createDiv({
				cls: "csv-cell-editor-holder",
			});
			this.cellInput = this.cellEditorHolder.createEl("input", {
				cls: "csv-cell-input csv-cell-input-shared",
			});
			this.setupSharedCellEditor();
			this.setupCellDelegation();

			// A2（issue #51）：滚动时重算虚拟窗口。
			// 真正的纵向滚动容器可能是 .main-scroll，也可能是 Obsidian 的 .view-content，
			// 所以用 document + capture 捕获所有 scroll 事件，实际窗口由 getScrollContainer() 判定。
			this.registerDomEvent(
				document,
				"scroll",
				() => this.onVirtualScroll(),
				{ capture: true }
			);

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
					// Only handle undo/redo when this view is the active view
					if (this.app.workspace.getActiveViewOfType(CSVView) !== this) return;

					// Ctrl+F / Cmd+F：聚焦表格内搜索框（issue #18）
					if (isSearchShortcut(event)) {
						event.preventDefault();
						this.focusSearch();
						return;
					}

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

			// 点击表格外部时取消行/列头选中。
			// 只在这里注册一次；以前放在 renderTable 里，导致每次刷新都往 document 上
			// 叠加一个永不释放的监听器（列宽拖拽时会瞬间泄漏上百个，issue #51）
			this.registerDomEvent(document, "click", (e: MouseEvent) => {
				const target = e.target as HTMLElement | null;
				if (target?.closest(".csv-col-number, .csv-row-number")) return;
				this.tableEl
					?.querySelectorAll(".csv-col-number.active, .csv-row-number.active")
					.forEach((el) => el.classList.remove("active"));
			});

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
			const errorDiv = this.contentEl.createDiv({
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
	// 高频 scroll 事件用 rAF 合并，避免布局抖动以及两个容器互相触发形成回环（issue #51）
	private setupScrollSync(topScroll: HTMLElement, mainScroll: HTMLElement) {
		let rafId = 0;
		let source: HTMLElement | null = null;

		const flush = () => {
			rafId = 0;
			const src = source;
			source = null;
			if (!src) return;
			(src === mainScroll ? topScroll : mainScroll).scrollLeft = src.scrollLeft;
		};

		const onScroll = (src: HTMLElement) => {
			source = src;
			if (!rafId) rafId = window.requestAnimationFrame(flush);
		};

		// registerDomEvent 会在视图关闭时自动解绑
		this.registerDomEvent(mainScroll, "scroll", () => onScroll(mainScroll));
		this.registerDomEvent(topScroll, "scroll", () => onScroll(topScroll));
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
		// 虚拟化时目标行可能没渲染，先把窗口挪过去
		this.ensureRowRendered(row);
		const td = this.getCellTd(row, col);
		if (!td) return;
		td.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
		window.setTimeout(() => {
			this.beginCellEdit(row, col);
			const tdNow = this.getCellTd(row, col);
			if (tdNow) {
				tdNow.classList.add("csv-search-current");
				window.setTimeout(() => {
					tdNow.classList.remove("csv-search-current");
				}, 3000);
			}
		}, 100);
	}

	// 新增：清除搜索高亮
	private clearSearchHighlights() {
		this.tableEl?.querySelectorAll(".csv-search-current").forEach(el => {
			if (el.instanceOf(HTMLElement)) {
				el.classList.remove("csv-search-current");
			}
		});
	}

	/**
	 * 聚焦表格内搜索框（Ctrl+F / Cmd+F，issue #18）。
	 * 搜索栏本身已在 onOpen 中创建，这里只负责把焦点交给它。
	 */
	private focusSearch() {
		this.searchBar?.focus();
	}

	// 新增：源码模式切换
	async openSourceMode() {
		const file = this.file;
		if (!file) return;
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.openFile(file, { active: true, state: { mode: "source" } });
		await leaf.setViewState({
			type: "csv-lite-source-view",
			active: true,
			state: { file: file.path }
		});
		this.leaf.detach(); // 新增：切换后关闭当前 leaf
	}

	/** 表头行不能被移动/删除/被其它行覆盖（issue #39） */
	private isProtectedHeaderRow(rowIndex: number): boolean {
		return this.firstRowAsHeader && rowIndex < 1;
	}

	// 新增：移动行/列方法
	moveRow(fromIndex: number, toIndex: number) {
		if (fromIndex < 0 || toIndex < 0 || fromIndex >= this.tableData.length || toIndex >= this.tableData.length) return;
		if (this.isProtectedHeaderRow(fromIndex) || this.isProtectedHeaderRow(toIndex)) {
			new Notice(i18n.t("notifications.headerRowProtected"));
			return;
		}
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

		// 移除所有现有的sticky类和内联样式
		this.tableEl.querySelectorAll('.csv-sticky-row, .csv-sticky-col, .csv-sticky-header, .csv-sticky-row-number').forEach(el => {
			el.classList.remove('csv-sticky-row', 'csv-sticky-col', 'csv-sticky-header', 'csv-sticky-row-number');
			// 清除之前设置的内联样式
			(el as HTMLElement).setCssStyles({ left: '', top: '' });
		});
			// 计算行号的实际宽度
			const getRowNumberWidth = (): number => {
				const firstRowNumber = this.tableEl.querySelector<HTMLElement>('tbody tr.csv-data-row td:first-child');
				return firstRowNumber ? firstRowNumber.offsetWidth : 40; // 默认40px
			};

			// 获取表头的实际高度
			const getHeaderHeight = (): number => {
				const headerRow = this.tableEl.querySelector<HTMLElement>('thead tr');
				return headerRow ? headerRow.offsetHeight : 30; // 默认30px
			};

			// 计算累积的固定列宽度（从行号列开始）
			const calculateStickyColumnsWidth = (upToIndex: number): number => {
				let totalWidth = getRowNumberWidth(); // 从行号列开始
				for (let i = 0; i < upToIndex; i++) {
					if (this.stickyColumns.has(i)) {
						const headerCell = this.tableEl.querySelector(`thead tr th:nth-child(${i + 2})`) as HTMLElement;
						if (headerCell) {
							totalWidth += headerCell.offsetWidth;
						} else {
							totalWidth += this.columnWidths[i] || 100; // 使用预设宽度或默认
						}
					}
				}
				return totalWidth;
			};

			// 计算累积的固定行高度（从表头开始）
			const calculateStickyRowsHeight = (upToIndex: number): number => {
				let totalHeight = getHeaderHeight(); // 从表头开始
				for (let i = 0; i < upToIndex; i++) {
					if (this.stickyRows.has(i)) {
						const row = this.tableEl.querySelector(`tbody tr:nth-child(${i + 1})`) as HTMLElement;
						if (row) {
							totalHeight += row.offsetHeight;
						} else {
							totalHeight += 32; // 默认行高
						}
					}
				}
				return totalHeight;
			};

		// 默认固定表头行（A、B、C、D...）
		if (this.stickyHeaders) {
			const headerCells = this.tableEl.querySelectorAll<HTMLElement>('thead tr th');
			headerCells.forEach(cell => {
				cell.classList.add('csv-sticky-header');
				cell.setCssStyles({ top: '0px' });
			});
		}

		// 默认固定行号列（0、1、2、3...）
		if (this.stickyRowNumbers) {
			// 行号列在表头中（左上角）
			const headerRowNumber = this.tableEl.querySelector<HTMLElement>('thead tr th:first-child');
			if (headerRowNumber) {
				headerRowNumber.classList.add('csv-sticky-row-number');
				headerRowNumber.setCssStyles({ left: '0px', top: '0px' });
			}
			
			// 行号列在数据行中
			const rowNumberCells = this.tableEl.querySelectorAll<HTMLElement>('tbody tr.csv-data-row td:first-child');
			rowNumberCells.forEach(cell => {
				cell.classList.add('csv-sticky-row-number');
				cell.setCssStyles({ left: '0px' });
			});
		}

		// 应用用户手动固定的行样式
		this.stickyRows.forEach(rowIndex => {
			const stickyTop = calculateStickyRowsHeight(rowIndex);
			// 数据行（在tbody中，从第1个tr开始）
			const rowCells = this.tableEl.querySelectorAll<HTMLElement>(`tbody tr[data-row="${rowIndex}"] td`);
			rowCells.forEach(cell => {
				cell.classList.add('csv-sticky-row');
				cell.setCssStyles({ top: `${stickyTop}px` });
			});
		});

		// 应用用户手动固定的列样式
		this.stickyColumns.forEach(colIndex => {
			const stickyLeft = calculateStickyColumnsWidth(colIndex);
			
			// 列头（在thead中，跳过行号列）
			const headerCell = this.tableEl.querySelector<HTMLElement>(`thead tr th:nth-child(${colIndex + 2})`);
			if (headerCell) {
				headerCell.classList.add('csv-sticky-col');
				headerCell.setCssStyles({ left: `${stickyLeft}px`, top: '0px' });
			}
			
			// 数据列（在tbody的所有行中，跳过行号列）
			const dataCells = this.tableEl.querySelectorAll<HTMLElement>(`tbody tr.csv-data-row td:nth-child(${colIndex + 2})`);
			dataCells.forEach(cell => {
				cell.classList.add('csv-sticky-col');
				cell.setCssStyles({ left: `${stickyLeft}px` });
			});
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
		// 表头模式下不允许在表头行上方插行（issue #39）
		const idx = Math.max(after ? rowIdx + 1 : rowIdx, this.getHeaderRowOffset());
		this.tableData.splice(idx, 0, Array(this.tableData[0].length).fill(""));
		this.refresh();
		this.requestSave();
	}
	private refreshDeleteRow(rowIdx: number) {
		if (this.tableData.length <= 1) return;
		if (this.isProtectedHeaderRow(rowIdx)) {
			new Notice(i18n.t("notifications.headerRowProtected"));
			return;
		}
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
