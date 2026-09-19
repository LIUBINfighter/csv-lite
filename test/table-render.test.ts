import { renderCellDisplay } from "../src/view/table-render";

jest.mock("../src/i18n", () => ({
	i18n: { t: jest.fn((key: string) => key) },
}));

/**
 * 极简 DOM 替身：只实现 renderCellDisplay / createUrlDisplay 用到的那几项。
 * jest 环境是 node，没有 jsdom，所以这里手动搭一个。
 */
class FakeEl {
	tag: string;
	className = "";
	title = "";
	textContent = "";
	children: FakeEl[] = [];
	parent: FakeEl | null = null;
	href = "";
	target = "";
	rel = "";
	onclick: ((e: any) => void) | null = null;

	constructor(tag: string) {
		this.tag = tag;
	}

	createEl(
		tag: string,
		opts?: { cls?: string; text?: string; attr?: Record<string, string> }
	): FakeEl {
		const el = new FakeEl(tag);
		if (opts?.cls) el.className = opts.cls;
		if (opts?.text !== undefined) el.textContent = opts.text;
		if (opts?.attr) {
			el.href = opts.attr.href || "";
			el.target = opts.attr.target || "";
			el.rel = opts.attr.rel || "";
		}
		this.appendChild(el);
		return el;
	}

	createDiv(opts?: { cls?: string; text?: string; attr?: Record<string, string> }): FakeEl {
		return this.createEl("div", opts);
	}

	createSpan(opts?: { cls?: string; text?: string; attr?: Record<string, string> }): FakeEl {
		return this.createEl("span", opts);
	}

	appendChild(child: FakeEl): FakeEl {
		child.parent = this;
		this.children.push(child);
		return child;
	}

	querySelector(selector: string): FakeEl | null {
		if (selector === ".csv-cell-display") {
			return (
				this.children.find((c) => c.className.includes("csv-cell-display")) ||
				null
			);
		}
		return null;
	}

	remove(): void {
		if (this.parent) {
			const idx = this.parent.children.indexOf(this);
			if (idx >= 0) this.parent.children.splice(idx, 1);
			this.parent = null;
		}
	}

	hasTag(tag: string): boolean {
		return this.children.some((c) => c.tag === tag);
	}

	countClass(cls: string): number {
		return this.children.filter((c) => c.className.includes(cls)).length;
	}
}

beforeAll(() => {
	(global as any).document = {
		createElement: (tag: string) => new FakeEl(tag),
	};
});

describe("renderCellDisplay (issue #51 / A1)", () => {
	test("plain cell renders a display layer and no <input>", () => {
		const td = new FakeEl("td");
		renderCellDisplay(td as any, "hello world");

		expect(td.hasTag("input")).toBe(false);
		const display = td.querySelector(".csv-cell-display");
		expect(display).not.toBeNull();
		expect(display!.textContent).toBe("hello world");
		expect(display!.title).toBe("hello world");
	});

	test("empty cell still renders a display layer (click target)", () => {
		const td = new FakeEl("td");
		renderCellDisplay(td as any, "");
		const display = td.querySelector(".csv-cell-display");
		expect(display).not.toBeNull();
		expect(display!.textContent).toBe("");
	});

	test("URL cell renders links and the ✎ edit button, not an <input>", () => {
		const td = new FakeEl("td");
		const onEdit = jest.fn();
		renderCellDisplay(td as any, "https://example.com/a", onEdit);

		expect(td.hasTag("input")).toBe(false);
		const display = td.querySelector(".csv-cell-display");
		expect(display).not.toBeNull();
		expect(display!.className).toContain("csv-cell-display-has-url");
		expect(display!.hasTag("a")).toBe(true);
		const btn = display!.children.find((c) =>
			c.className.includes("csv-cell-edit-btn")
		);
		expect(btn).toBeTruthy();
		btn!.onclick!({ stopPropagation: jest.fn() });
		expect(onEdit).toHaveBeenCalledTimes(1);
	});

	test("re-rendering replaces the previous display layer (no accumulation)", () => {
		const td = new FakeEl("td");
		renderCellDisplay(td as any, "first");
		renderCellDisplay(td as any, "second");
		expect(td.countClass("csv-cell-display")).toBe(1);
		expect(td.querySelector(".csv-cell-display")!.textContent).toBe("second");
	});

	test("switching a cell between URL and plain text swaps the display", () => {
		const td = new FakeEl("td");
		renderCellDisplay(td as any, "https://example.com");
		expect(td.countClass("csv-cell-display")).toBe(1);
		renderCellDisplay(td as any, "plain");
		const display = td.querySelector(".csv-cell-display")!;
		expect(td.countClass("csv-cell-display")).toBe(1);
		expect(display.className).not.toContain("csv-cell-display-has-url");
		expect(display.textContent).toBe("plain");
	});
});
