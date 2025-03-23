import { TextFileView } from "obsidian";

export const VIEW_TYPE_CSV = "csv-view";

export class CSVView extends TextFileView {
  tableData: string[][];
  tableEl: HTMLElement;

  getViewData() {
    return this.tableData.map((row) => row.join(",")).join("\n");
  }

  setViewData(data: string, clear: boolean) {
    this.tableData = data.split("\n").map((line) => line.split(","));
    this.refresh();
  }

  refresh() {
    this.tableEl.empty();
    const tableBody = this.tableEl.createEl("tbody");

    this.tableData.forEach((row, i) => {
      const tableRow = tableBody.createEl("tr");
      row.forEach((cell, j) => {
        const input = tableRow
          .createEl("td")
          .createEl("input", { attr: { value: cell } });
        
        input.oninput = (ev) => {
          if (ev.currentTarget instanceof HTMLInputElement) {
            this.tableData[i][j] = ev.currentTarget.value;
            this.requestSave();
          }
        };
      });
    });
  }

  clear() {
    this.tableData = [];
  }

  getViewType() {
    return VIEW_TYPE_CSV;
  }

  async onOpen() {
    this.tableEl = this.contentEl.createEl("table");
  }

  async onClose() {
    this.contentEl.empty();
  }
}
