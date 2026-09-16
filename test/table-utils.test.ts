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
});
