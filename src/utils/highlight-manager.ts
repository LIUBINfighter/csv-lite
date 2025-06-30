// highlight-manager.ts
// 专注于表格行/列高亮与选中状态的管理

export class HighlightManager {
	private tableEl: HTMLElement;
	private selectedRow: number = -1;
	private selectedCol: number = -1;

	constructor(tableEl: HTMLElement) {
		this.tableEl = tableEl;
	}
	public selectRow(rowIndex: number) {
		console.log('[HighlightManager] selectRow called with index:', rowIndex);
		if (this.selectedRow === rowIndex) {
			this.clearSelection();
			return;
		}
		this.clearSelection();
		this.selectedRow = rowIndex;
		this.highlightRow(rowIndex);
	}

	public selectColumn(colIndex: number) {
		console.log('[HighlightManager] selectColumn called with index:', colIndex);
		if (this.selectedCol === colIndex) {
			this.clearSelection();
			return;
		}
		this.clearSelection();
		this.selectedCol = colIndex;
		this.highlightColumn(colIndex);
	}

	public clearSelection() {
		console.log('[HighlightManager] clearSelection called');
		this.selectedRow = -1;
		this.selectedCol = -1;
		this.clearHighlight();
	}

	public getSelectedRow() {
		return this.selectedRow;
	}
	public getSelectedCol() {
		return this.selectedCol;
	}

	public setTableEl(tableEl: HTMLElement) {
		this.tableEl = tableEl;
	}
	private highlightRow(rowIndex: number) {
		console.log('[HighlightManager] highlightRow called with index:', rowIndex);
		const rows = this.tableEl?.querySelectorAll('tbody tr');
		console.log('[HighlightManager] 找到的tbody行数:', rows?.length);
		// 修复：rowIndex 已经是正确的索引，不需要减 1
		const targetRowIndex = rowIndex;
		if (rows && rows[targetRowIndex]) {
			console.log('[HighlightManager] 高亮目标行:', rows[targetRowIndex]);
			(rows[targetRowIndex] as HTMLElement).classList.add('csv-row-selected');
		} else {
			console.log('[HighlightManager] 未找到目标行，rowIndex:', rowIndex, 'targetRowIndex:', targetRowIndex);
		}
	}

	private highlightColumn(colIndex: number) {
		console.log('[HighlightManager] highlightColumn called with index:', colIndex);
		const columnCells = this.tableEl?.querySelectorAll(`th:nth-child(${colIndex + 2}), td:nth-child(${colIndex + 2})`);
		console.log('[HighlightManager] 找到的列单元格数:', columnCells?.length);
		if (columnCells) {
			console.log('[HighlightManager] 列单元格:', columnCells);
		}
		columnCells?.forEach(cell => {
			if (cell instanceof HTMLElement) {
				cell.classList.add('csv-col-selected');
			}
		});
	}

	private clearHighlight() {
		console.log('[HighlightManager] clearHighlight called');
		const selectedElements = this.tableEl?.querySelectorAll('.csv-row-selected, .csv-col-selected');
		console.log('[HighlightManager] 清除高亮元素数:', selectedElements?.length);
		selectedElements?.forEach(el => {
			if (el instanceof HTMLElement) {
				el.classList.remove('csv-row-selected');
				el.classList.remove('csv-col-selected');
			}
		});
	}
}
