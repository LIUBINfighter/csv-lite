/**
 * 键盘快捷键判定（纯函数，便于单测，不依赖 DOM KeyboardEvent）。
 */

/** 键盘事件的最小形状 */
export interface KeyEventLike {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
}

/**
 * Ctrl+F / Cmd+F：聚焦表格内搜索框（issue #18）。
 *
 * 刻意排除带 Shift / Alt 的组合，避免抢占 Obsidian 的
 * `Ctrl+Shift+F`（在所有文件中搜索）。
 */
export function isSearchShortcut(e: KeyEventLike): boolean {
	if (!e.ctrlKey && !e.metaKey) return false;
	if (e.shiftKey || e.altKey) return false;
	return e.key === "f" || e.key === "F";
}
