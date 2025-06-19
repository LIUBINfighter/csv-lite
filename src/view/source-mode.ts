import { CSVUtils } from "../utils/csv-utils";

export interface SourceModeOptions {
  tableData: string[][];
  delimiter: string;
  quoteChar: string;
  isSourceMode: boolean;
  sourceTextarea: HTMLTextAreaElement | null;
  sourceCursorPos: { start: number; end: number };
  contentEl: HTMLElement;
  onTableDataChange: (data: string[][]) => void;
  onCursorPosChange: (pos: { start: number; end: number }) => void;
}

export function renderSourceMode(options: SourceModeOptions) {
  // ...源码模式渲染逻辑骨架...
}
