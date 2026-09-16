import { TableUtils } from "../utils/table-utils";
import { CSVUtils } from "../utils/csv-utils";
import { i18n } from "../i18n";
import { setIcon } from "obsidian";
import { containsUrl, createUrlDisplay } from "../utils/url-utils";

export interface TableRenderOptions {
  tableData: string[][];
  columnWidths: number[];
  tableEl: HTMLElement;
  requestSave: () => void;
  selectRow: (rowIndex: number) => void;
  selectColumn: (colIndex: number) => void;
  getColumnLabel: (index: number) => string;
  setupColumnResize: (handle: HTMLElement, columnIndex: number) => void;
  insertRowAt: (rowIndex: number, after?: boolean) => void;
  deleteRowAt: (rowIndex: number) => void;
  insertColAt: (colIndex: number, after?: boolean) => void;
  deleteColAt: (colIndex: number) => void;
  /**
   * URL/Markdown 单元格里的编辑按钮（✎）被点击时触发。
   * 普通单元格的点击由 CSVView 在 tableEl 上做事件委托处理（issue #51）。
   */
  onEditCell?: (row: number, col: number, td: HTMLElement) => void;
  /**
   * A2（issue #51）：只渲染 [start, end) 行，上下用 spacer 撑住总高度。
   * 不传则全量渲染（小文件行为完全不变）。
   */
  virtualWindow?: { start: number; end: number; topPad: number; bottomPad: number };
  // 拖拽排序回调
  onColumnReorder?: (from: number, to: number) => void;
  onRowReorder?: (from: number, to: number) => void;
  // 固定行列相关
  stickyRows?: Set<number>;
  stickyColumns?: Set<number>;
  toggleRowSticky?: (rowIndex: number) => void;
  toggleColumnSticky?: (colIndex: number) => void;
}

/**
 * 把一个单元格的内容渲染成只读显示层（链接仍可点击）。
 * 编辑交给 CSVView 里那个共享的 <input>，所以这里不再创建输入框。
 */
export function renderCellDisplay(
  td: HTMLElement,
  cell: string,
  onEditClick?: () => void
) {
  const old = td.querySelector(".csv-cell-display");
  if (old) old.remove();
  if (containsUrl(cell)) {
    td.appendChild(createUrlDisplay(cell, onEditClick));
  } else {
    const display = td.createEl("div", { cls: "csv-cell-display" });
    display.textContent = cell;
    if (cell) display.title = cell;
  }
}

export function renderTable(options: TableRenderOptions) {
  const {
    tableData,
    columnWidths,
    tableEl,
    requestSave,
    selectRow,
    selectColumn,
    getColumnLabel,
    setupColumnResize,
    insertRowAt,
    deleteRowAt,
    insertColAt,
    deleteColAt,
    onEditCell,
    virtualWindow,
    onColumnReorder,
    onRowReorder,
    stickyRows,
    stickyColumns,
    toggleRowSticky,
    toggleColumnSticky,
  } = options;

  // 插入/删除行列按钮目前在 styles.css 里被 display:none 隐藏（见 docs/button-visibility.md）。
  // 1000 行的大表会白白多出数千个 DOM 节点与事件处理器，所以直接不创建（issue #51）。
  // 以后要恢复这些按钮，把这里改成 true 并去掉 CSS 里的 display:none 即可。
  const SHOW_STRUCTURE_BUTTONS = false;

  tableEl.empty();

  // 拖拽状态变量移到函数外部作用域
  if (!(window as any)._csvLiteDragState) {
    (window as any)._csvLiteDragState = { type: null, index: null };
  }
  const dragState: { type: 'row' | 'col' | null, index: number | null } = (window as any)._csvLiteDragState;
  function setDragState(type: 'row' | 'col' | null, index: number | null) {
    dragState.type = type;
    dragState.index = index;
    tableEl.classList.remove('csv-dragging-row', 'csv-dragging-col');
    if (type === 'row') tableEl.classList.add('csv-dragging-row');
    if (type === 'col') tableEl.classList.add('csv-dragging-col');
  }

  // 计算初始列宽（如果未设置）
  if (columnWidths.length === 0 && tableData[0]) {
    const widths = TableUtils.calculateColumnWidths(tableData);
    columnWidths.splice(0, columnWidths.length, ...widths);
  }

  // 创建列号行（在表格顶部）- 修复：先渲染表头
  const headerRow = tableEl.createEl("thead").createEl("tr");

  // 添加左上角单元格
  const cornerTh = headerRow.createEl("th", { cls: "csv-corner-cell" });

  // 创建列号行
  if (tableData[0]) {
    tableData[0].forEach((headerCell, index) => {
      const th = headerRow.createEl("th", {
        cls: "csv-col-number",
        attr: {
          style: `width: ${columnWidths[index] || 100}px`,
          draggable: "true",
        },
      });
      th.textContent = getColumnLabel(index);
      th.onclick = (e) => {
        e.stopPropagation();
        selectColumn(index);
      };

      // 添加pin/unpin按钮
      if (toggleColumnSticky) {
        const isSticky = stickyColumns?.has(index) || false;
        const pinBtn = th.createEl("button", {
          cls: `csv-pin-btn csv-pin-col ${isSticky ? 'pinned' : ''}`,
          attr: { title: isSticky ? "Unpin column" : "Pin column" }
        });
        setIcon(pinBtn, isSticky ? "pin-off" : "pin");
        pinBtn.onclick = (e) => {
          e.stopPropagation();
          toggleColumnSticky(index);
        };
      }
      // 拖拽排序事件
      th.ondragstart = (e) => {
        e.dataTransfer?.setData("text/col-index", String(index));
        th.classList.add("dragging");
        setDragState('col', index);
        if (typeof requestSave === 'function') requestSave();
      };
      th.ondragend = () => {
        th.classList.remove("dragging");
        setDragState(null, null);
        if (typeof requestSave === 'function') requestSave();
      };
      th.ondragover = (e) => {
        e.preventDefault();
        th.classList.add("drag-over");
      };
      th.ondragleave = () => {
        th.classList.remove("drag-over");
      };
      th.ondrop = (e) => {
        e.preventDefault();
        th.classList.remove("drag-over");
        setDragState(null, null);
        const from = Number(e.dataTransfer?.getData("text/col-index"));
        const to = index;
        if (onColumnReorder && from !== to) {
          onColumnReorder(from, to);
        }
      };
      // 插入列操作按钮（拖拽时隐藏）
      if (SHOW_STRUCTURE_BUTTONS && !(dragState.type === 'col')) {
        const insertLeft = th.createEl("button", { cls: "csv-insert-col-btn left" });
        insertLeft.innerText = "+";
        insertLeft.title = i18n.t("buttons.insertColBefore") || "Insert column before";
        insertLeft.onclick = (e) => { e.stopPropagation(); options.insertColAt(index, false); };
        const insertRight = th.createEl("button", { cls: "csv-insert-col-btn right" });
        insertRight.innerText = "+";
        insertRight.title = i18n.t("buttons.insertColAfter") || "Insert column after";
        insertRight.onclick = (e) => { e.stopPropagation(); options.insertColAt(index, true); };
        const delCol = th.createEl("button", { cls: "csv-del-col-btn" });
        delCol.innerText = "-";
        delCol.title = i18n.t("buttons.deleteColumn") || "Delete column";
        delCol.onclick = (e) => { e.stopPropagation(); options.deleteColAt(index); };
      }
      // 拖拽高亮整列及相邻列
      if (dragState.type === 'col' && dragState.index !== null) {
        const colStart = Math.max(0, dragState.index - 2);
        const colEnd = Math.min(tableData[0].length - 1, dragState.index + 2);
        if (index >= colStart && index <= colEnd) {
          th.classList.add('csv-dragging-highlight');
        }
      }

      // 在列号单元格中添加拖拽事件处理逻辑
      const resizeHandle = th.createEl("div", { cls: "resize-handle" });
      setupColumnResize(resizeHandle, index);
    });
  }

  // 创建表格主体 - 所有行都作为普通数据行处理
  const tableBody = tableEl.createEl("tbody");

  // A2（issue #51）：只渲染可见行窗口，上下用 spacer 撑住总高度，
  // 这样滚动条长度不变、 scrollTop 不跳。
  const firstRowIndex = virtualWindow ? Math.max(0, virtualWindow.start) : 0;
  const lastRowIndex = virtualWindow
    ? Math.min(tableData.length, virtualWindow.end)
    : tableData.length;
  const totalColumns = (tableData[0]?.length || 0) + 1; // 含行号列

  const createSpacerRow = (height: number) => {
    if (!(height > 0)) return;
    const spacer = tableBody.createEl("tr", { cls: "csv-virtual-spacer" });
    spacer.createEl("td", {
      attr: {
        colspan: String(Math.max(1, totalColumns)),
        style: `height:${height}px;padding:0;border:0;`,
      },
    });
  };

  if (virtualWindow) createSpacerRow(virtualWindow.topPad);

  // 从窗口起点开始，包括第一行
  for (let i = firstRowIndex; i < lastRowIndex; i++) {
    const row = tableData[i];
    const tableRow = tableBody.createEl("tr", {
      cls: "csv-data-row",
      attr: { "data-row": String(i) },
    });
    const rowNumberCell = tableRow.createEl("td", { cls: "csv-row-number", attr: { draggable: "true" } });
    rowNumberCell.textContent = i.toString();
    rowNumberCell.onclick = (e) => {
      e.stopPropagation();
      selectRow(i);
    };

    // 添加pin/unpin按钮
    if (toggleRowSticky) {
      const isSticky = stickyRows?.has(i) || false;
      const pinBtn = rowNumberCell.createEl("button", {
        cls: `csv-pin-btn csv-pin-row ${isSticky ? 'pinned' : ''}`,
        attr: { title: isSticky ? "Unpin row" : "Pin row" }
      });
      setIcon(pinBtn, isSticky ? "pin-off" : "pin");
      pinBtn.onclick = (e) => {
        e.stopPropagation();
        toggleRowSticky(i);
      };
    }
    // 拖拽排序事件
    rowNumberCell.ondragstart = (e) => {
      e.dataTransfer?.setData("text/row-index", String(i));
      rowNumberCell.classList.add("dragging");
      setDragState('row', i);
      if (typeof requestSave === 'function') requestSave();
    };
    rowNumberCell.ondragend = () => {
      rowNumberCell.classList.remove("dragging");
      setDragState(null, null);
      if (typeof requestSave === 'function') requestSave();
    };
    rowNumberCell.ondragover = (e) => {
      e.preventDefault();
      rowNumberCell.classList.add("drag-over");
    };
    rowNumberCell.ondragleave = () => {
      rowNumberCell.classList.remove("drag-over");
    };
    rowNumberCell.ondrop = (e) => {
      e.preventDefault();
      rowNumberCell.classList.remove("drag-over");
      setDragState(null, null);
      const from = Number(e.dataTransfer?.getData("text/row-index"));
      const to = i;
      if (onRowReorder && from !== to) {
        onRowReorder(from, to);
      }
    };
    // 插入行操作按钮（拖拽时隐藏）
    if (SHOW_STRUCTURE_BUTTONS && !(dragState.type === 'row')) {
      const insertAbove = rowNumberCell.createEl("button", { cls: "csv-insert-row-btn above" });
      insertAbove.innerText = "+";
      insertAbove.title = i18n.t("buttons.insertRowBefore") || "Insert row before";
      insertAbove.onclick = (e) => { e.stopPropagation(); options.insertRowAt(i, false); };
      const insertBelow = rowNumberCell.createEl("button", { cls: "csv-insert-row-btn below" });
      insertBelow.innerText = "+";
      insertBelow.title = i18n.t("buttons.insertRowAfter") || "Insert row after";
      insertBelow.onclick = (e) => { e.stopPropagation(); options.insertRowAt(i, true); };
      const delRow = rowNumberCell.createEl("button", { cls: "csv-del-row-btn" });
      delRow.innerText = "-";
      delRow.title = i18n.t("buttons.deleteRow") || "Delete row";
      delRow.onclick = (e) => { e.stopPropagation(); options.deleteRowAt(i); };
    }
    // 拖拽高亮整行及相邻行
    if (dragState.type === 'row' && dragState.index !== null) {
      const rowStart = Math.max(0, dragState.index - 2);
      const rowEnd = Math.min(tableData.length - 1, dragState.index + 2);
      if (i >= rowStart && i <= rowEnd) {
        rowNumberCell.classList.add('csv-dragging-highlight');
        Array.from(tableRow.children).forEach(td => {
          (td as HTMLElement).classList.add('csv-dragging-highlight');
        });
      }
    }
    row.forEach((cell, j) => {
      const td = tableRow.createEl("td", {
        cls: "csv-cell",
        attr: {
          style: `width: ${columnWidths[j] || 100}px`,
          "data-row": String(i),
          "data-col": String(j),
        },
      });

      // 只渲染只读显示层；编辑由 CSVView 里那个共享的 <input> 负责。
      // 以前每格一个 <input>，1000 x 27 的表就是 27,000 个 input + 54,000 个监器（issue #51）。
      renderCellDisplay(td, cell, () => onEditCell?.(i, j, td));
    });
  }

  if (virtualWindow) createSpacerRow(virtualWindow.bottomPad);

  // 滚动条容器宽度同步逻辑建议由主类处理
  // 注：点击表格外部取消行/列选中的监听器已改到 CSVView.onOpen 里只注册一次，
  // 否则每次 renderTable 都会往 document 上叠加一个永不释放的监听器（issue #51）
}

// 建议在 styles.css 添加 .dragging 和 .drag-over 的样式以增强拖拽反馈
