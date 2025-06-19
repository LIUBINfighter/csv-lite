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
		// console.log('[HighlightManager] selectRow', rowIndex);
		if (this.selectedRow === rowIndex) {
			this.clearSelection();
			return;
		}
		this.clearSelection();
		this.selectedRow = rowIndex;
		this.highlightRow(rowIndex);
	}

	public selectColumn(colIndex: number) {
		// console.log('[HighlightManager] selectColumn', colIndex);
		if (this.selectedCol === colIndex) {
			this.clearSelection();
			return;
		}
		this.clearSelection();
		this.selectedCol = colIndex;
		this.highlightColumn(colIndex);
	}

	public clearSelection() {
		// console.log('[HighlightManager] clearSelection');
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
		// console.log('[HighlightManager] highlightRow', rowIndex);
		const rows = this.tableEl?.querySelectorAll('tbody tr');
		const targetRowIndex = rowIndex - 1;
		if (rows && rows[targetRowIndex]) {
			// console.log('[HighlightManager] highlightRow target', rows[targetRowIndex]);
			(rows[targetRowIndex] as HTMLElement).classList.add('csv-row-selected');
		}
	}

	private highlightColumn(colIndex: number) {
		// console.log('[HighlightManager] highlightColumn', colIndex);
		const columnCells = this.tableEl?.querySelectorAll(`th:nth-child(${colIndex + 2}), td:nth-child(${colIndex + 2})`);
		if (columnCells) {
			// console.log('[HighlightManager] highlightColumn cells', columnCells);
		}
		columnCells?.forEach(cell => {
			if (cell instanceof HTMLElement) {
				cell.classList.add('csv-col-selected');
			}
		});
	}

	private clearHighlight() {
		// console.log('[HighlightManager] clearHighlight');
		this.tableEl?.querySelectorAll('.csv-row-selected, .csv-col-selected').forEach(el => {
			if (el instanceof HTMLElement) {
				el.classList.remove('csv-row-selected');
				el.classList.remove('csv-col-selected');
			}
		});
	}
}
