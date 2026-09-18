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
		if (this.selectedRow === rowIndex) {
			this.clearSelection();
			return;
		}
		this.clearSelection();
		this.selectedRow = rowIndex;
		this.highlightRow(rowIndex);
	}

	public selectColumn(colIndex: number) {
		if (this.selectedCol === colIndex) {
			this.clearSelection();
			return;
		}
		this.clearSelection();
		this.selectedCol = colIndex;
		this.highlightColumn(colIndex);
	}

	public clearSelection() {
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
		// 用 data-row 定位，兼容行虚拟化（issue #51）
		const row = this.tableEl?.querySelector(
			`tbody tr[data-row="${rowIndex}"]`
		) as HTMLElement | null;
		if (row) {
			row.classList.add("csv-row-selected");
		}
	}

	private highlightColumn(colIndex: number) {
		const columnCells = this.tableEl?.querySelectorAll(
			`th:nth-child(${colIndex + 2}), td:nth-child(${colIndex + 2})`
		);
		columnCells?.forEach((cell) => {
			if (cell.instanceOf(HTMLElement)) {
				cell.classList.add("csv-col-selected");
			}
		});
	}

	private clearHighlight() {
		const selectedElements = this.tableEl?.querySelectorAll(
			".csv-row-selected, .csv-col-selected"
		);
		selectedElements?.forEach((el) => {
			if (el.instanceOf(HTMLElement)) {
				el.classList.remove("csv-row-selected");
				el.classList.remove("csv-col-selected");
			}
		});
	}
}
