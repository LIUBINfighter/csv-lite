import * as Papa from "papaparse";
import { Notice } from "obsidian";
import { i18n } from "../i18n";

export interface CSVParseConfig {
	header: boolean;
	dynamicTyping: boolean;
	skipEmptyLines: boolean;
	delimiter?: string;
	quoteChar: string;
	escapeChar: string;
}

export class CSVUtils {
	// 现在这是默认设置的唯一权威来源
	static defaultConfig: CSVParseConfig = {
		header: false,
		dynamicTyping: false,
		skipEmptyLines: false,
		delimiter: ",",
		quoteChar: '"', // 关键：这是修复报告bug的关键
		escapeChar: '"',
	};

	/**
	 * 解析CSV字符串为二维数组
	 */
	static parseCSV(
		csvString: string,
		config?: Partial<CSVParseConfig>
	): string[][] {
		try {
			const parseConfig = { ...this.defaultConfig, ...config };
			const parseResult = Papa.parse(csvString, parseConfig);

			if (parseResult.errors && parseResult.errors.length > 0) {
				console.warn("CSV解析警告:", parseResult.errors);
				new Notice(`CSV解析提示: ${parseResult.errors[0].message}`);
			}

			return parseResult.data as string[][];
		} catch (error) {
			console.error("CSV解析错误:", error);
			new Notice(`${i18n.t("csv.error")}: CSV解析失败，请检查文件格式`);
			return [[""]];
		}
	}

	/**
	 * 将二维数组转换为CSV字符串
	 */
	static unparseCSV(data: string[][], config?: Papa.UnparseConfig): string {
		const defaultUnparseConfig = {
			header: false,
			newline: "\n",
		};

		return Papa.unparse(data, { ...defaultUnparseConfig, ...config });
	}

	/**
	 * 确保表格数据规整（所有行的列数相同）
	 */
	static normalizeTableData(tableData: string[][]): string[][] {
		if (!tableData || tableData.length === 0) return [[""]];

		// 找出最大列数
		let maxCols = 0;
		for (const row of tableData) {
			if (row) {
				maxCols = Math.max(maxCols, row.length);
			}
		}

		// 确保每行都有相同的列数
		const normalizedData = tableData.map((row) => {
			const newRow = row ? [...row] : [];
			while (newRow.length < maxCols) {
				newRow.push("");
			}
			return newRow;
		});

		return normalizedData;
	}
}
