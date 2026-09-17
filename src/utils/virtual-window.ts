/**
 * 行虚拟化（A2 / issue #51）的窗口计算，纯函数，方便单测。
 *
 * 表格里只渲染 [start, end) 这一段行，上下用等高的 spacer 把总高度撑住，
 * 这样滚动条长度不变、scrollTop 也不会跳。
 */

export interface VirtualWindow {
	/** 渲染起始行（0-based，含） */
	start: number;
	/** 渲染结束行（0-based，不含） */
	end: number;
	/** 顶部 spacer 高度（px） */
	topPad: number;
	/** 底部 spacer 高度（px） */
	bottomPad: number;
}

/**
 * 根据滚动位置算出要渲染的行区间。
 *
 * @param totalRows      总行数
 * @param rowHeight      单行高度（px，必须 > 0）
 * @param scrollTop      当前纵向滚动距离
 * @param viewportHeight 可视区高度
 * @param overscan       可视区上下各多渲染几行，避免快速滚动露白
 */
export function computeVirtualWindow(
	totalRows: number,
	rowHeight: number,
	scrollTop: number,
	viewportHeight: number,
	overscan: number = 8
): VirtualWindow {
	const rows = Math.max(0, Math.floor(totalRows));
	if (rows === 0) {
		return { start: 0, end: 0, topPad: 0, bottomPad: 0 };
	}

	const h = rowHeight > 0 && Number.isFinite(rowHeight) ? rowHeight : 24;
	const visibleCount = Math.max(
		1,
		Math.ceil(Math.max(0, viewportHeight) / h) + 1
	);
	const firstVisible = Math.max(0, Math.floor(Math.max(0, scrollTop) / h));
	const over = Math.max(0, Math.floor(overscan));

	const start = Math.max(0, Math.min(rows - 1, firstVisible - over));
	const end = Math.max(
		start + 1,
		Math.min(rows, firstVisible + visibleCount + over)
	);

	return {
		start,
		end,
		topPad: start * h,
		bottomPad: Math.max(0, (rows - end) * h),
	};
}

/**
 * 把「tbody 行空间」的窗口平移到 tableData 的真实行号上。
 * 用于「首行为表头」模式：第 0 行在 thead 里，tbody 从第 1 行开始（issue #39）。
 * spacer 高度（topPad/bottomPad）按 tbody 行数计算，保持不变。
 */
export function offsetVirtualWindow(
	window: VirtualWindow,
	offset: number
): VirtualWindow {
	if (!offset) return window;
	return {
		...window,
		start: window.start + offset,
		end: window.end + offset,
	};
}
