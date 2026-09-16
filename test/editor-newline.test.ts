import { Compartment, EditorState } from "@codemirror/state";
import { replaceDoc } from "../src/utils/editor-newline";

const CRLF = "\r\n";
const LF = "\n";

// 与 SourceView 中一致：模块级 Compartment 用于热更新 lineSeparator
const lineSeparatorCompartment = new Compartment();

function makeState(doc: string, newline: string): EditorState {
	return EditorState.create({
		doc,
		extensions: [
			lineSeparatorCompartment.of(EditorState.lineSeparator.of(newline)),
		],
	});
}

describe("replaceDoc newline handling (issue #52)", () => {
	test("loading CRLF data into an LF-separator state keeps CRLF", () => {
		let state = makeState("", LF);
		state = replaceDoc(state, lineSeparatorCompartment, "a,b\r\nc,d\r\n", CRLF);
		expect(state.sliceDoc()).toBe("a,b\r\nc,d\r\n");
		expect(state.sliceDoc()).not.toContain("\r\r");
	});

	test("loading LF data into a CRLF-separator state keeps LF", () => {
		let state = makeState("", CRLF);
		state = replaceDoc(state, lineSeparatorCompartment, "a,b\nc,d\n", LF);
		expect(state.sliceDoc()).toBe("a,b\nc,d\n");
		expect(state.sliceDoc()).not.toContain("\r");
	});

	test("reloading the same newline style is idempotent", () => {
		let state = makeState("x\r\ny\r\n", CRLF);
		state = replaceDoc(state, lineSeparatorCompartment, "a,b\r\nc,d\r\n", CRLF);
		expect(state.sliceDoc()).toBe("a,b\r\nc,d\r\n");
	});

	test("user edits after a CRLF reload do not introduce \\r\\r", () => {
		let state = makeState("", LF);
		state = replaceDoc(state, lineSeparatorCompartment, "a,b\r\nc,d\r\n", CRLF);
		// 模拟用户在文档末尾输入 "!"
		state = state.update({
			changes: { from: state.doc.length, insert: "!" },
		}).state;
		const out = state.sliceDoc();
		expect(out).toBe("a,b\r\nc,d\r\n!");
		expect(out).not.toContain("\r\r");
	});

	// 记录这个坑：把 reconfigure 和 insert 放进同一个事务会产生 \r\r\n，
	// 这正是 #52 报告里 “文件被搞坏” 的直接原因。
	test("regression: reconfiguring and inserting in one transaction corrupts CRLF", () => {
		const state = makeState("", LF);
		const bad = state.update({
			changes: { from: 0, to: 0, insert: "a,b\r\nc,d\r\n" },
			effects: lineSeparatorCompartment.reconfigure(
				EditorState.lineSeparator.of(CRLF)
			),
		}).state;
		expect(bad.sliceDoc()).toContain("\r\r");
	});
});
