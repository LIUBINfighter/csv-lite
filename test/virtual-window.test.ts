import { computeVirtualWindow } from "../src/utils/virtual-window";

describe("computeVirtualWindow (A2 / issue #51)", () => {
	test("renders only the visible window plus overscan", () => {
		// 1000 行、每行 24px、可视 600px、滚动到第 500 行附近
		const w = computeVirtualWindow(1000, 24, 500 * 24, 600, 8);
		expect(w.start).toBe(500 - 8);
		// 可视 600/24 = 25 行，+1 再 +overscan
		expect(w.end).toBe(500 + 25 + 1 + 8);
		expect(w.topPad).toBe((500 - 8) * 24);
		expect(w.bottomPad).toBe((1000 - w.end) * 24);
	});

	test("topPad + rendered + bottomPad always equals total height", () => {
		for (const scrollTop of [0, 100, 5000, 23976, 999999]) {
			const w = computeVirtualWindow(1000, 24, scrollTop, 600, 8);
			const renderedHeight = (w.end - w.start) * 24;
			expect(w.topPad + renderedHeight + w.bottomPad).toBe(1000 * 24);
		}
	});

	test("window never exceeds the data bounds", () => {
		const first = computeVirtualWindow(1000, 24, 0, 600, 8);
		expect(first.start).toBe(0);
		expect(first.topPad).toBe(0);

		const last = computeVirtualWindow(1000, 24, 999999, 600, 8);
		expect(last.end).toBe(1000);
		expect(last.bottomPad).toBe(0);
	});

	test("always renders at least one row", () => {
		const w = computeVirtualWindow(1, 24, 0, 600, 8);
		expect(w.start).toBe(0);
		expect(w.end).toBe(1);
		expect(w.topPad).toBe(0);
		expect(w.bottomPad).toBe(0);
	});

	test("handles empty data", () => {
		expect(computeVirtualWindow(0, 24, 0, 600, 8)).toEqual({
			start: 0,
			end: 0,
			topPad: 0,
			bottomPad: 0,
		});
	});

	test("falls back to a sane row height for bad input", () => {
		expect(computeVirtualWindow(100, 0, 0, 600, 8).topPad).toBe(0);
		const w = computeVirtualWindow(100, NaN, 240, 600, 8);
		expect(w.start).toBeGreaterThanOrEqual(0);
		expect(w.end).toBeGreaterThan(w.start);
	});

	test("overscan of 0 still renders the visible rows", () => {
		const w = computeVirtualWindow(1000, 20, 20 * 50, 400, 0);
		expect(w.start).toBe(50);
		expect(w.end).toBe(50 + 20 + 1);
	});
});
