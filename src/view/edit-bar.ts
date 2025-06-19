import { TableUtils } from "../utils/table-utils";

export interface EditBarOptions {
  editBarEl: HTMLElement;
  editInput: HTMLInputElement;
  activeCellEl: HTMLInputElement | null;
  activeRowIndex: number;
  activeColIndex: number;
  tableData: string[][];
  onEdit: (row: number, col: number, value: string) => void;
}

/**
 * 渲染编辑栏并绑定事件
 */
export function renderEditBar(options: EditBarOptions) {
  const { editBarEl, editInput, activeCellEl, activeRowIndex, activeColIndex, tableData, onEdit } = options;

  // 设置编辑栏输入框的值和地址
  if (activeCellEl) {
    editInput.value = activeCellEl.value;
    // 显示单元格地址
    const cellAddress = TableUtils.getCellAddress(activeRowIndex, activeColIndex);
    editBarEl.setAttribute("data-cell-address", cellAddress);
  } else {
    editInput.value = "";
    editBarEl.removeAttribute("data-cell-address");
  }

  // 解绑旧事件，防止重复绑定
  editInput.oninput = null;

  // 绑定输入事件
  editInput.oninput = () => {
    if (
      activeCellEl &&
      activeRowIndex >= 0 &&
      activeColIndex >= 0
    ) {
      // 更新活动单元格
      activeCellEl.value = editInput.value;
      // 更新数据
      if (tableData[activeRowIndex][activeColIndex] !== editInput.value) {
        onEdit(activeRowIndex, activeColIndex, editInput.value);
      }
    }
  };
}
