import * as Papa from "papaparse";
import { Notice } from "obsidian";
import { i18n } from "../i18n";

export interface CSVParseConfig {
	header: boolean;
	dynamicTyping: boolean;
	skipEmptyLines: boolean;
	delimiter?: string; // use 'auto' to enable auto-detection
	quoteChar: string;
	escapeChar: string;
}

export class CSVUtils {
	// 现在这是默认设置的唯一权威来源
	static defaultConfig: CSVParseConfig = {
		header: false,
		dynamicTyping: false,
		skipEmptyLines: false,
			delimiter: 'auto',
		quoteChar: '"', // 关键：这是修复报告bug的关键
		escapeChar: '"',
		};

		/**
		 * 简单的分隔符检测器：在前几行统计候选分隔符（逗号/分号/制表符/竖线）
		 * 对每个候选符号，统计每行在引号外出现的分隔符数量，选择字段数量最一致且>1的分隔符。
		 */
		static detectDelimiter(csvString: string, quoteChar = '"') : string {
			if (!csvString || csvString.length === 0) return ',';
			const candidates = [',', ';', '\t', '|'];

			// Build logical records by honoring quoted multiline fields.
			const records: string[] = [];
			let cur = '';
			let inQuote = false;
			for (let i = 0; i < csvString.length; i++) {
				const ch = csvString[i];
				if (ch === quoteChar) {
					// handle escaped quote ""
					if (i + 1 < csvString.length && csvString[i + 1] === quoteChar) {
						cur += quoteChar;
						i++; // skip escaped
						continue;
					}
					inQuote = !inQuote;
					cur += ch;
					continue;
				}
				if (!inQuote && ch === '\n') {
					records.push(cur);
					cur = '';
					continue;
				}
				// keep CR if present inside quotes or ignore standalone CR
				if (!inQuote && ch === '\r') continue;
				cur += ch;
			}
			if (cur.length > 0) records.push(cur);

			// limit to first 20 non-empty records
			const sample = records.map(r => r).filter(r => r.trim().length > 0).slice(0, 20);
			if (sample.length === 0) return ',';

			function countFields(record: string, delim: string) {
				let inQ = false;
				let count = 0;
				for (let i = 0; i < record.length; i++) {
					const ch = record[i];
					if (ch === quoteChar) {
						if (i + 1 < record.length && record[i + 1] === quoteChar) {
							i++; // skip escaped
							continue;
						}
						inQ = !inQ;
						continue;
					}
					if (!inQ && ch === delim) count++;
				}
				return count + 1;
			}

			let best: { delim: string; score: number; avgFields: number; consistency: number } | null = null;
			for (const d of candidates) {
				const counts = sample.map(r => countFields(r, d));
				const avg = counts.reduce((a,b) => a+b,0)/counts.length;
				const variance = counts.reduce((a,b) => a + Math.pow(b - avg, 2), 0) / counts.length;
				const score = (avg > 1 ? avg : 0) - variance * 0.1;
				if (!best || score > best.score) {
					best = { delim: d, score, avgFields: avg, consistency: variance };
				}
			}
			if (best && best.avgFields >= 1.5) {
				return best.delim;
			}
			return ',';
		}


	/**
	 * 解析CSV字符串为二维数组
	 */
	static parseCSV(
		csvString: string,
		config?: Partial<CSVParseConfig>
	): string[][] {
		try {
			const parseConfig = { ...this.defaultConfig, ...config };
			// 如果启用了自动检测，则尝试检测分隔符并覆盖parseConfig.delimiter
			if (!parseConfig.delimiter || parseConfig.delimiter === 'auto') {
				const detected = this.detectDelimiter(csvString, parseConfig.quoteChar);
				parseConfig.delimiter = detected;
			}
			const parseResult: any = Papa.parse(csvString, parseConfig as any);

			if (parseResult.errors && parseResult.errors.length > 0) {
				console.warn("CSV parse warnings:", parseResult.errors);
				new Notice(`${i18n.t("csv.parseWarning")} ${parseResult.errors[0].message}`);
			}

			return parseResult.data as string[][];
		} catch (error) {
			console.error("CSV parse error:", error);
			new Notice(i18n.t("csv.parsingFailed"));
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
	 * 检测文件主要使用的换行风格（CRLF 或 LF）。
	 * 用于保存时无损还原原始换行，避免只是查看就把 CRLF 静默改成 LF（issue #52）。
	 */
	static detectNewline(csvString: string): string {
		if (!csvString) return "\n";
		let crlf = 0;
		let lf = 0;
		for (let i = 0; i < csvString.length; i++) {
			if (csvString.charCodeAt(i) === 10 /* \n */) {
				if (i > 0 && csvString.charCodeAt(i - 1) === 13 /* \r */) crlf++;
				else lf++;
			}
		}
		if (crlf > 0 && lf === 0) return "\r\n";
		return crlf > lf ? "\r\n" : "\n";
	}

	/**
	 * 提取文件结尾的换行序列（如 "\n"、"\n\n"、"\r\n"），
	 * 以及它会让 Papa 解析器多出来的「幽灵空行」数量。
	 * 每个 \n 计为一个逻辑行结束符（\r\n 只算一个）。
	 */
	static getTrailingNewline(csvString: string): {
		newline: string;
		rowCount: number;
	} {
		if (!csvString) return { newline: "", rowCount: 0 };
		let start = csvString.length;
		while (
			start > 0 &&
			(csvString[start - 1] === "\n" || csvString[start - 1] === "\r")
		) {
			start--;
		}
		const newline = csvString.slice(start);
		let rowCount = 0;
		for (let i = 0; i < newline.length; i++) {
			if (newline.charCodeAt(i) === 10 /* \n */) rowCount++;
		}
		return { newline, rowCount };
	}

	/**
	 * 移除解析器因文件结尾换行而生成的幽灵空行。
	 * 至少保留一行，避免出现空表；保存时由调用方原样补回换行。
	 */
	static dropTrailingRows(
		tableData: string[][],
		rowCount: number
	): string[][] {
		if (!tableData || rowCount <= 0) return tableData;
		const removable = Math.min(rowCount, Math.max(0, tableData.length - 1));
		if (removable <= 0) return tableData;
		return tableData.slice(0, tableData.length - removable);
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
