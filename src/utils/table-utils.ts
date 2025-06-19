import { Notice } from "obsidian";

export class TableUtils {
	/**
	 * 计算表格列宽
	 */
	static calculateColumnWidths(tableData: string[][]): number[] {
		if (!tableData || tableData.length === 0 || !tableData[0]) return [];

		// 初始化所有列为默认宽度
		const columnWidths = tableData[0].map(() => 100);

		// 根据内容长度进行简单调整
		tableData.forEach((row) => {
			row.forEach((cell, index) => {
				// 根据内容长度估算合适的宽度
				const estimatedWidth = Math.max(
					50,
					Math.min(300, cell.length * 10)
				);
				columnWidths[index] = Math.max(
					columnWidths[index],
					estimatedWidth
				);
			});
		});

		return columnWidths;
	}

	/**
	 * 添加新行
	 */
	static addRow(tableData: string[][]): string[][] {
		const colCount = tableData.length > 0 ? tableData[0].length : 1;
		const newRow = Array(colCount).fill("");
		return [...tableData, newRow];
	}

	/**
	 * 删除最后一行
	 */
	static deleteRow(tableData: string[][]): string[][] {
		if (tableData.length <= 1) {
			new Notice("至少需要保留一行");
			return tableData;
		}

		return tableData.slice(0, -1);
	}

	/**
	 * 添加新列
	 */
	static addColumn(tableData: string[][]): string[][] {
		return tableData.map((row) => [...row, ""]);
	}

	/**
	 * 删除最后一列
	 */
	static deleteColumn(tableData: string[][]): string[][] {
		if (!tableData[0] || tableData[0].length <= 1) {
			new Notice("至少需要保留一列");
			return tableData;
		}

		return tableData.map((row) => row.slice(0, -1));
	}

	/**
	 * 向指定列左侧添加新列
	 */
	static addColumnToLeft(
		tableData: string[][],
		columnIndex: number
	): string[][] {
		if (!tableData || tableData.length === 0) return [];

		return tableData.map((row) => {
			const newRow = [...row];
			newRow.splice(columnIndex, 0, "");
			return newRow;
		});
	}

	/**
	 * 向指定列右侧添加新列
	 */
	static addColumnToRight(
		tableData: string[][],
		columnIndex: number
	): string[][] {
		if (!tableData || tableData.length === 0) return [];

		return tableData.map((row) => {
			const newRow = [...row];
			newRow.splice(columnIndex + 1, 0, "");
			return newRow;
		});
	}

	/**
	 * 获取列标签 (A, B, C, ..., Z, AA, AB, ...)
	 */
	static getColumnLabel(index: number): string {
		let label = "";
		let n = index;

		while (n >= 0) {
			label = String.fromCharCode(65 + (n % 26)) + label;
			n = Math.floor(n / 26) - 1;
		}

		return label;
	}

	/**
	 * 获取单元格地址标识（例如A1, B2）
	 */
	static getCellAddress(rowIndex: number, colIndex: number): string {
		const colAddress = this.getColumnLabel(colIndex);
		const rowAddress = rowIndex + 1;
		return `${colAddress}${rowAddress}`;
	}

	/**
	 * 从表格元素提取表格数据
	 */
	static getTableData(tableEl: HTMLElement): string[][] {
		const rows = Array.from(tableEl.querySelectorAll("tr"));
		return rows.map((row) => {
			const cells = Array.from(row.querySelectorAll("td, th"));
			return cells.map((cell) => cell.textContent || "");
		});
	}
}
