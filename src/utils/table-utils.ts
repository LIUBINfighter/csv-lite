import { Notice } from "obsidian";
import { i18n } from "../i18n";

export class TableUtils {
	/**
	 * 自动列宽只采样前 N 行。
	 * 大表（几万格）没必要为算列宽全表扫一遍；取值硬编码，不做设置项。
	 */
	static readonly COLUMN_WIDTH_SAMPLE_ROWS = 200;

	/**
	 * 计算表格列宽
	 */
	static calculateColumnWidths(tableData: string[][]): number[] {
		if (!tableData || tableData.length === 0 || !tableData[0]) return [];

		// 初始化所有列为默认宽度
		const columnWidths = tableData[0].map(() => 100);

		// 只采样前 N 行，根据内容长度做简单调整
		const sampleRows = Math.min(
			tableData.length,
			TableUtils.COLUMN_WIDTH_SAMPLE_ROWS
		);
		for (let r = 0; r < sampleRows; r++) {
			const row = tableData[r];
			if (!row) continue;
			for (let c = 0; c < row.length; c++) {
				const cell = row[c] ?? "";
				const estimatedWidth = Math.max(
					50,
					Math.min(300, cell.length * 10)
				);
				columnWidths[c] = Math.max(
					columnWidths[c] ?? 100,
					estimatedWidth
				);
			}
		}

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
			new Notice(i18n.t("tableMessages.atLeastOneRow"));
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
			new Notice(i18n.t("tableMessages.atLeastOneColumn"));
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
