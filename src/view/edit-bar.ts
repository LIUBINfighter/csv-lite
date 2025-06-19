export interface EditBarOptions {
  editBarEl: HTMLElement;
  editInput: HTMLInputElement;
  activeCellEl: HTMLInputElement | null;
  activeRowIndex: number;
  activeColIndex: number;
  tableData: string[][];
  onEdit: (row: number, col: number, value: string) => void;
}

export function renderEditBar(options: EditBarOptions) {
  // ...编辑栏渲染逻辑骨架...
}
