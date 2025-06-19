import { TableUtils } from "../utils/table-utils";
import { CSVUtils } from "../utils/csv-utils";
import { i18n } from "../i18n";

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
  } = options;

  tableEl.empty();

  // 创建表头行（包含列号）
  const headerRow = tableEl.createEl("thead").createEl("tr");

  // 计算初始列宽（如果未设置）
  if (columnWidths.length === 0 && tableData[0]) {
    const widths = TableUtils.calculateColumnWidths(tableData);
    columnWidths.splice(0, columnWidths.length, ...widths);
  }

  // 添加左上角单元格
  headerRow.createEl("th", { cls: "csv-corner-cell" });

  // 创建列号行
  if (tableData[0]) {
    tableData[0].forEach((headerCell, index) => {
      const th = headerRow.createEl("th", {
        cls: "csv-col-number",
        attr: {
          style: `width: ${columnWidths[index] || 100}px`,
        },
      });
      th.textContent = getColumnLabel(index);
      th.onclick = () => selectColumn(index);
    });
  }

  // 创建表头数据行
  const dataHeaderRow = tableEl.createEl("thead").createEl("tr");
  const headerRowNumber = dataHeaderRow.createEl("th", { cls: "csv-row-number" });
  headerRowNumber.textContent = "0";

  if (tableData[0]) {
    tableData[0].forEach((headerCell, index) => {
      const th = dataHeaderRow.createEl("th", {
        cls: "csv-th",
        attr: {
          style: `width: ${columnWidths[index] || 100}px`,
        },
      });
      const headerInput = th.createEl("input", {
        cls: "csv-cell-input",
        attr: { value: headerCell },
      });
      headerInput.oninput = (ev) => {
        if (ev.currentTarget instanceof HTMLInputElement) {
          saveSnapshot();
          tableData[0][index] = ev.currentTarget.value;
          requestSave();
        }
      };
      headerInput.onfocus = (ev) => {
        setActiveCell(0, index, ev.currentTarget as HTMLInputElement);
      };
      const resizeHandle = th.createEl("div", { cls: "resize-handle" });
      setupColumnResize(resizeHandle, index);
    });
  }

  // 创建表格主体
  const tableBody = tableEl.createEl("tbody");
  const startRowIndex = tableData.length > 1 ? 1 : 0;
  for (let i = startRowIndex; i < tableData.length; i++) {
    const row = tableData[i];
    const tableRow = tableBody.createEl("tr");
    const rowNumberCell = tableRow.createEl("td", { cls: "csv-row-number" });
    rowNumberCell.textContent = i.toString();
    rowNumberCell.onclick = () => selectRow(i);
    row.forEach((cell, j) => {
      const td = tableRow.createEl("td", {
        attr: { style: `width: ${columnWidths[j] || 100}px` },
      });
      const input = td.createEl("input", {
        cls: "csv-cell-input",
        attr: { value: cell },
      });
      setupAutoResize(input);
      input.oninput = (ev) => {
        if (ev.currentTarget instanceof HTMLInputElement) {
          saveSnapshot();
          tableData[i][j] = ev.currentTarget.value;
          if (activeCellEl === ev.currentTarget && editInput) {
            editInput.value = ev.currentTarget.value;
          }
          requestSave();
          if (autoResize) {
            adjustInputHeight(ev.currentTarget);
          }
        }
      };
      input.onfocus = (ev) => {
        setActiveCell(i, j, ev.currentTarget as HTMLInputElement);
      };
    });
  }

  // 滚动条容器宽度同步逻辑建议由主类处理
}
