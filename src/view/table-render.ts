import { TableUtils } from "../utils/table-utils";
import { CSVUtils } from "../utils/csv-utils";
import { i18n } from "../i18n";
import { setIcon } from "obsidian";
import { containsUrl, createUrlDisplay } from "../utils/url-utils";

export interface TableRenderOptions {
  tableData: string[][];
  columnWidths: number[];
  autoResize: boolean;
  tableEl: HTMLElement;
  editInput: HTMLInputElement;
  activeCellEl: HTMLInputElement | null;
  activeRowIndex: number;
  activeColIndex: number;
  setActiveCell: (row: number, col: number, cellEl: HTMLInputElement) => void;
  saveSnapshot: () => void;
  requestSave: () => void;
  setupAutoResize: (input: HTMLInputElement) => void;
  adjustInputHeight: (input: HTMLInputElement) => void;
  selectRow: (rowIndex: number) => void;
  selectColumn: (colIndex: number) => void;
  getColumnLabel: (index: number) => string;
  setupColumnResize: (handle: HTMLElement, columnIndex: number) => void;
  insertRowAt: (rowIndex: number, after?: boolean) => void;
  deleteRowAt: (rowIndex: number) => void;
  insertColAt: (colIndex: number, after?: boolean) => void;
  deleteColAt: (colIndex: number) => void;
  // 新增：可选的renderEditBar回调
  renderEditBar?: (row: number, col: number, cellEl: HTMLInputElement) => void;
  // 拖拽排序回调
  onColumnReorder?: (from: number, to: number) => void;
  onRowReorder?: (from: number, to: number) => void;
  // 新增：固定行列相关
  stickyRows?: Set<number>;
  stickyColumns?: Set<number>;
  toggleRowSticky?: (rowIndex: number) => void;
  toggleColumnSticky?: (colIndex: number) => void;
}

export function renderTable(options: TableRenderOptions) {
  const {
    tableData,
    columnWidths,
    autoResize,
    tableEl,
    editInput,
    activeCellEl,
    activeRowIndex,
    activeColIndex,
    setActiveCell,
    saveSnapshot,
    requestSave,
    setupAutoResize,
    adjustInputHeight,
    selectRow,
    selectColumn,
    getColumnLabel,
    setupColumnResize,
    insertRowAt,
    deleteRowAt,
    insertColAt,
    deleteColAt,
    renderEditBar,
    onColumnReorder,
    onRowReorder,
    stickyRows,
    stickyColumns,
    toggleRowSticky,
    toggleColumnSticky,
  } = options;

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
      if (!(dragState.type === 'col')) {
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
  
  // 从索引0开始，包括第一行
  for (let i = 0; i < tableData.length; i++) {
    const row = tableData[i];
    const tableRow = tableBody.createEl("tr");
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
    if (!(dragState.type === 'row')) {
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
        attr: { style: `width: ${columnWidths[j] || 100}px` },
      });
      
      const input = td.createEl("input", {
        cls: "csv-cell-input",
        attr: { value: cell },
      });
      
      // Create display layer for URL rendering
      const hasUrl = containsUrl(cell);
      let displayEl: HTMLElement | null = null;
      
      // Function to enter edit mode
      const enterEditMode = () => {
        const display = td.querySelector('.csv-cell-display') as HTMLElement;
        if (display) {
          display.style.display = 'none';
        }
        input.style.display = 'block';
        input.focus();
      };
      
      if (hasUrl) {
        displayEl = createUrlDisplay(cell, enterEditMode);
        td.insertBefore(displayEl, input);
      }
      
      setupAutoResize(input);
      
      // Hide input initially if URL display is shown
      if (hasUrl && displayEl) {
        input.style.display = 'none';
        displayEl.style.display = 'block';
      }
      
      input.oninput = (ev) => {
        if (ev.currentTarget instanceof HTMLInputElement) {
          saveSnapshot();
          tableData[i][j] = ev.currentTarget.value;
          if (activeCellEl === ev.currentTarget && editInput) {
            editInput.value = ev.currentTarget.value;
          }
          // 新增：表格单元格编辑时同步编辑栏
          if (renderEditBar) {
            renderEditBar(i, j, ev.currentTarget);
          }
          requestSave();
          if (autoResize) {
            adjustInputHeight(ev.currentTarget);
          }
          
          // Update display on input change
          const newHasUrl = containsUrl(ev.currentTarget.value);
          const tdEl = ev.currentTarget.parentElement;
          if (tdEl) {
            const existingDisplay = tdEl.querySelector('.csv-cell-display');
            if (newHasUrl) {
              // Create or update display
              if (existingDisplay) {
                existingDisplay.remove();
              }
              const inputEl = ev.currentTarget;
              const newDisplay = createUrlDisplay(ev.currentTarget.value, () => {
                // Enter edit mode: show input first, then focus
                const disp = tdEl.querySelector('.csv-cell-display') as HTMLElement;
                if (disp) {
                  disp.style.display = 'none';
                }
                inputEl.style.display = 'block';
                inputEl.focus();
              });
              tdEl.insertBefore(newDisplay, ev.currentTarget);
            } else if (existingDisplay) {
              // Remove display if no URLs
              existingDisplay.remove();
            }
          }
        }
      };
      
      input.onfocus = (ev) => {
        if (ev.currentTarget instanceof HTMLInputElement) {
          setActiveCell(i, j, ev.currentTarget);
          // Hide display and show input when focused
          const tdEl = ev.currentTarget.parentElement;
          if (tdEl) {
            const display = tdEl.querySelector('.csv-cell-display') as HTMLElement;
            if (display) {
              display.style.display = 'none';
              ev.currentTarget.style.display = 'block';
            }
          }
        }
      };
      
      input.onblur = (ev) => {
        if (ev.currentTarget instanceof HTMLInputElement) {
          // Show display and hide input when blurred (if contains URL)
          const tdEl = ev.currentTarget.parentElement;
          if (tdEl) {
            const display = tdEl.querySelector('.csv-cell-display') as HTMLElement;
            if (display && containsUrl(ev.currentTarget.value)) {
              display.style.display = 'block';
              ev.currentTarget.style.display = 'none';
            }
          }
        }
      };
    });
  }

  // 滚动条容器宽度同步逻辑建议由主类处理

  // Add event listener to deselect active row or column when clicking outside
  const deselectActiveHeader = () => {
    const activeHeaders = tableEl.querySelectorAll('.csv-col-number.active, .csv-row-number.active');
    activeHeaders.forEach(header => header.classList.remove('active'));
  };

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const isHeaderClick = target?.closest('.csv-col-number, .csv-row-number');
    if (!isHeaderClick) {
      deselectActiveHeader();
    }
  });
}

// 建议在 styles.css 添加 .dragging 和 .drag-over 的样式以增强拖拽反馈
