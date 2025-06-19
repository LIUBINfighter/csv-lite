import { ButtonComponent, Setting } from "obsidian";
import { i18n } from "../i18n";

export interface OperationBarOptions {
  operationEl: HTMLElement;
  delimiter: string;
  quoteChar: string;
  onDelimiterChange: (delimiter: string) => void;
  onQuoteCharChange: (quoteChar: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddRow: () => void;
  onDeleteRow: () => void;
  onAddColumn: () => void;
  onDeleteColumn: () => void;
  onResetColumnWidth: () => void;
  isSourceMode: boolean;
  onToggleSourceMode: () => void;
}

export function renderOperationBar(options: OperationBarOptions) {
  // ...操作栏渲染逻辑骨架...
}
