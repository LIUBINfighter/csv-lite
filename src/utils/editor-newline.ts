import { Compartment, EditorState } from "@codemirror/state";

/**
 * 用新内容替换整个 CodeMirror 文档，并（必要时）同步换行分隔符。
 *
 * 顺序很关键：**必须先 reconfigure lineSeparator，再 insert 内容**。
 * 如果放在同一个事务里，待插入的字符串会按旧的 lineBreak 切分，`\r` 会被
 * 当成普通字符保留在行尾，之后按 `\r\n` 序列化就变成 `\r\r\n`（issue #52）。
 */
export function replaceDoc(
	state: EditorState,
	lineSeparatorCompartment: Compartment,
	data: string,
	newline: string
): EditorState {
	let next = state;
	if (next.facet(EditorState.lineSeparator) !== newline) {
		next = next.update({
			effects: lineSeparatorCompartment.reconfigure(
				EditorState.lineSeparator.of(newline)
			),
		}).state;
	}
	return next.update({
		changes: { from: 0, to: next.doc.length, insert: data },
	}).state;
}
