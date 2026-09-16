import { TableUtils } from "../src/utils/table-utils";

jest.mock("../src/i18n", () => ({
	i18n: { t: jest.fn((key: string) => key) },
}));

describe("TableUtils.calculateColumnWidths (auto column width on load)", () => {
	test("gives every column at least the default width", () => {
		const widths = TableUtils.calculateColumnWidths([["a", "b"]]);
		expect(widths).toEqual([100, 100]);
	});

	test("widens a column to fit its longest cell", () => {
		const widths = TableUtils.calculateColumnWidths([
			["id", "name"],
			["1", "a fairly long value"],
		]);
		expect(widths[0]).toBe(100);
		expect(widths[1]).toBe("a fairly long value".length * 10);
	});

	test("caps the width at 300px", () => {
		const widths = TableUtils.calculateColumnWidths([
			["x".repeat(200)],
		]);
		expect(widths[0]).toBe(300);
	});

	test("never goes below 50px even for empty cells", () => {
		const widths = TableUtils.calculateColumnWidths([["", ""]]);
		expect(widths).toEqual([100, 100]);
	});

	test("returns [] for empty input", () => {
		expect(TableUtils.calculateColumnWidths([])).toEqual([]);
		expect(TableUtils.calculateColumnWidths(null as any)).toEqual([]);
	});

	test("returns one width per column of the first row", () => {
		const widths = TableUtils.calculateColumnWidths([["a", "b", "c"]]);
		expect(widths).toHaveLength(3);
	});

	test("only samples the first N rows on large tables", () => {
		const n = TableUtils.COLUMN_WIDTH_SAMPLE_ROWS;
		const rows: string[][] = [];
		for (let i = 0; i < n; i++) rows.push(["short", "short"]);
		// 第 N+1 行有一个超长单元格，应该被忽略
		rows.push(["short", "x".repeat(200)]);

		const widths = TableUtils.calculateColumnWidths(rows);
		expect(widths[1]).toBe(100);
	});

	test("a long cell inside the sampled range still widens the column", () => {
		const n = TableUtils.COLUMN_WIDTH_SAMPLE_ROWS;
		const rows: string[][] = [];
		rows.push(["short", "x".repeat(20)]); // 前 N 行之内
		for (let i = 1; i < n; i++) rows.push(["short", "short"]);

		const widths = TableUtils.calculateColumnWidths(rows);
		expect(widths[1]).toBe(200);
	});

	test("does not crash on missing cells", () => {
		const widths = TableUtils.calculateColumnWidths([
			["a", "b", "c"],
			["x"],
		]);
		expect(widths).toHaveLength(3);
	});
});
