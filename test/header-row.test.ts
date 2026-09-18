import { renderTable } from "../src/view/table-render";

jest.mock("../src/i18n", () => ({
	i18n: { t: jest.fn((key: string) => key) },
}));

/**
 * 极简 DOM 替身，够 renderTable（非虚拟/虚拟路径）跑通即可。
 * jest 环境是 node，没有 jsdom。
 */
class FakeClassList {
	private classes = new Set<string>();

	add(...names: string[]) {
		names.forEach((n) => this.classes.add(n));
	}

	remove(...names: string[]) {
		names.forEach((n) => this.classes.delete(n));
	}

	contains(name: string) {
		return this.classes.has(name);
	}

	toggle(name: string, force?: boolean) {
		const want = force === undefined ? !this.classes.has(name) : force;
		if (want) this.classes.add(name);
		else this.classes.delete(name);
		return want;
	}
}

class FakeEl {
	tag: string;
	className = "";
	textContent = "";
	title = "";
	children: FakeEl[] = [];
	parent: FakeEl | null = null;
	attrs: Record<string, string> = {};
	classList = new FakeClassList();
	onclick: ((e: any) => void) | null = null;

	constructor(tag: string) {
		this.tag = tag;
	}

	empty() {
		this.children = [];
	}

	createEl(
		tag: string,
		opts?: { cls?: string; text?: string; attr?: Record<string, string> }
	): FakeEl {
		const el = new FakeEl(tag);
		if (opts?.cls) {
			el.className = opts.cls;
			opts.cls.split(/\s+/).forEach((c) => c && el.classList.add(c));
		}
		if (opts?.text !== undefined) el.textContent = opts.text;
		if (opts?.attr) el.attrs = { ...opts.attr };
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
		if (selector.startsWith(".")) {
			const cls = selector.slice(1);
			return this.children.find((c) => c.classList.contains(cls)) || null;
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
}

beforeAll(() => {
	(global as any).document = {
		createElement: (tag: string) => new FakeEl(tag),
	};
	(global as any).window = {};
});

const DATA = [
	["Name", "Age"],
	["John", "35"],
	["Jane", "28"],
];

function render(
	tableData: string[][],
	firstRowAsHeader: boolean,
	virtualWindow?: { start: number; end: number; topPad: number; bottomPad: number }
) {
	const tableEl = new FakeEl("table");
	renderTable({
		tableData,
		columnWidths: [],
		tableEl: tableEl as any,
		requestSave: jest.fn(),
		selectRow: jest.fn(),
		selectColumn: jest.fn(),
		getColumnLabel: (index: number) => String.fromCharCode(65 + index),
		setupColumnResize: jest.fn(),
		insertRowAt: jest.fn(),
		deleteRowAt: jest.fn(),
		insertColAt: jest.fn(),
		deleteColAt: jest.fn(),
		firstRowAsHeader,
		virtualWindow,
	});
	return tableEl;
}

function getTheadThs(tableEl: FakeEl): FakeEl[] {
	const thead = tableEl.children.find((c) => c.tag === "thead")!;
	const tr = thead.children[0];
	return tr.children;
}

function getBodyRows(tableEl: FakeEl): FakeEl[] {
	const tbody = tableEl.children.find((c) => c.tag === "tbody")!;
	return tbody.children.filter((c) => c.classList.contains("csv-data-row"));
}

describe("renderTable first row as header (issue #39)", () => {
	test("renders the first row as column headers in thead", () => {
		const tableEl = render(DATA, true);
		expect(tableEl.classList.contains("csv-header-row-mode")).toBe(true);

		const ths = getTheadThs(tableEl);
		// ths[0] 是左上角，数据列从 ths[1] 开始
		const nameTh = ths[1];
		expect(nameTh.classList.contains("csv-col-number")).toBe(true);
		expect(nameTh.classList.contains("csv-header-cell")).toBe(true);

		const letter = nameTh.children.find((c) =>
			c.classList.contains("csv-col-letter")
		);
		const text = nameTh.children.find((c) =>
			c.classList.contains("csv-header-text")
		);
		expect(letter?.textContent).toBe("A");
		expect(text?.textContent).toBe("Name");
		expect(ths[2].children.find((c) => c.classList.contains("csv-header-text"))?.textContent).toBe("Age");
	});

	test("tbody starts at row 1 and keeps real row indices", () => {
		const tableEl = render(DATA, true);
		const rows = getBodyRows(tableEl);
		expect(rows.length).toBe(2);
		expect(rows[0].attrs["data-row"]).toBe("1");
		expect(rows[1].attrs["data-row"]).toBe("2");
		// 行号列显示真实索引，数据列是第二行开始的内容
		expect(rows[0].children[0].textContent).toBe("1");
		expect(
			rows[0].children[1].querySelector(".csv-cell-display")?.textContent
		).toBe("John");
	});

	test("non-header mode is unchanged: column letters and all rows as data", () => {
		const tableEl = render(DATA, false);
		expect(tableEl.classList.contains("csv-header-row-mode")).toBe(false);

		const ths = getTheadThs(tableEl);
		expect(ths[1].textContent).toBe("A");
		expect(ths[2].textContent).toBe("B");

		const rows = getBodyRows(tableEl);
		expect(rows.length).toBe(3);
		expect(rows[0].attrs["data-row"]).toBe("0");
		expect(
			rows[0].children[1].querySelector(".csv-cell-display")?.textContent
		).toBe("Name");
	});

	test("virtual window in header mode renders only the window and keeps spacers", () => {
		const tableEl = render(DATA, true, {
			start: 2,
			end: 3,
			topPad: 24,
			bottomPad: 0,
		});
		const rows = getBodyRows(tableEl);
		expect(rows.length).toBe(1);
		expect(rows[0].attrs["data-row"]).toBe("2");

		const tbody = tableEl.children.find((c) => c.tag === "tbody")!;
		const topSpacer = tbody.children[0];
		expect(topSpacer.classList.contains("csv-virtual-spacer")).toBe(true);
		expect(topSpacer.children[0].attrs["style"]).toContain("height:24px");
	});

	test("double-clicking a header cell asks the view to edit that column", () => {
		const tableEl = new FakeEl("table");
		const onEditHeader = jest.fn();
		renderTable({
			tableData: DATA,
			columnWidths: [],
			tableEl: tableEl as any,
			requestSave: jest.fn(),
			selectRow: jest.fn(),
			selectColumn: jest.fn(),
			getColumnLabel: (index: number) => String.fromCharCode(65 + index),
			setupColumnResize: jest.fn(),
			insertRowAt: jest.fn(),
			deleteRowAt: jest.fn(),
			insertColAt: jest.fn(),
			deleteColAt: jest.fn(),
			firstRowAsHeader: true,
			onEditHeader,
		});

		const ths = getTheadThs(tableEl);
		(ths[2] as any).ondblclick({ stopPropagation: jest.fn() });
		expect(onEditHeader).toHaveBeenCalledWith(1);
	});

	test("header text falls back to the column letter when the cell is empty", () => {
		const tableEl = render([["", "Age"], ["x", "1"]], true);
		const ths = getTheadThs(tableEl);
		expect(
			ths[1].children.find((c) => c.classList.contains("csv-header-text"))
		).toBeUndefined();
		expect(
			ths[1].children.find((c) => c.classList.contains("csv-col-letter"))
				?.textContent
		).toBe("A");
	});
});
