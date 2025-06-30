import { i18n } from "../i18n";

export interface SearchBarOptions {
  getTableData: () => string[][];
  tableEl: HTMLElement;
  getColumnLabel: (index: number) => string;
  getCellAddress: (row: number, col: number) => string;
  jumpToCell: (row: number, col: number) => void;
  clearSearchHighlights: () => void;
}

export class SearchBar {
  private searchInput: HTMLInputElement;
  private searchResults: HTMLElement;
  private searchContainer: HTMLElement;
  private searchMatches: Array<{ row: number; col: number; value: string }> = [];
  private currentSearchIndex: number = -1;
  private options: SearchBarOptions;

  constructor(parentContainer: HTMLElement, options: SearchBarOptions) {
    this.options = options;
    this.searchContainer = parentContainer.createEl("div", {
      cls: "csv-search-container",
    });
    this.searchInput = this.searchContainer.createEl("input", {
      cls: "csv-search-input",
      attr: {
        type: "text",
        placeholder: i18n.t("search.placeholder"),
      },
    });
    this.searchResults = this.searchContainer.createEl("div", {
      cls: "csv-search-results",
    });
    this.setupSearchEvents();
  }

  private setupSearchEvents() {
    let searchTimeout: NodeJS.Timeout;
    this.searchInput.addEventListener("input", () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.performSearch(this.searchInput.value);
      }, 300);
    });
    this.searchInput.addEventListener("focus", () => {
      if (this.searchMatches.length > 0) {
        this.searchResults.classList.add("show");
      }
    });
    this.searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.navigateSearchResults(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.navigateSearchResults(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.selectCurrentSearchResult();
      } else if (e.key === "Escape") {
        this.searchInput.value = "";
        this.performSearch("");
        this.hideSearchResults();
      }
    });
    document.addEventListener("click", (e) => {
      if (!this.searchContainer.contains(e.target as Node)) {
        this.hideSearchResults();
      }
    });
  }

  private performSearch(query: string) {
    this.searchMatches = [];
    this.currentSearchIndex = -1;
    if (!query.trim()) {
      this.hideSearchResults();
      this.options.clearSearchHighlights();
      return;
    }
    const searchTerm = query.toLowerCase().trim();
    const tableData = this.options.getTableData();
    for (let i = 0; i < tableData.length; i++) {
      for (let j = 0; j < tableData[i].length; j++) {
        const cellValue = tableData[i][j];
        if (cellValue.toLowerCase().includes(searchTerm)) {
          this.searchMatches.push({ row: i, col: j, value: cellValue });
        }
      }
    }
    this.displaySearchResults(query);
  }

  private displaySearchResults(query: string) {
    this.searchResults.empty();
    if (this.searchMatches.length === 0) {
      const noResults = this.searchResults.createEl("div", {
        cls: "csv-search-result-item",
        text: i18n.t("search.noResults"),
      });
      noResults.style.color = "var(--text-muted)";
      this.searchResults.classList.add("show");
      return;
    }
    const displayMatches = this.searchMatches.slice(0, 10);
    displayMatches.forEach((match, index) => {
      const resultItem = this.searchResults.createEl("div", {
        cls: "csv-search-result-item",
      });
      const cellInfo = resultItem.createEl("div");
      cellInfo.createEl("span", {
        cls: "csv-search-result-cell",
        text: this.options.getCellAddress(match.row, match.col),
      });
      cellInfo.createEl("span", {
        cls: "csv-search-result-address",
        text: i18n.t("search.rowColumn", {
          row: (match.row + 1).toString(),
          col: (match.col + 1).toString(),
        }),
      });
      const preview = resultItem.createEl("div", {
        cls: "csv-search-result-preview",
      });
      preview.innerHTML = this.highlightSearchTerm(match.value, query);
      resultItem.addEventListener("click", () => {
        this.options.jumpToCell(match.row, match.col);
        this.hideSearchResults();
      });
      resultItem.setAttribute("data-index", index.toString());
    });
    if (this.searchMatches.length > 10) {
      const moreResults = this.searchResults.createEl("div", {
        cls: "csv-search-result-item",
        text: i18n.t("search.moreResults", {
          count: (this.searchMatches.length - 10).toString(),
        }),
      });
      moreResults.style.color = "var(--text-muted)";
      moreResults.style.fontStyle = "italic";
    }
    this.searchResults.classList.add("show");
  }

  private highlightSearchTerm(text: string, searchTerm: string): string {
    if (!searchTerm.trim()) return text;
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="csv-search-highlight">$1</span>');
  }

  private navigateSearchResults(direction: number) {
    const items = this.searchResults.querySelectorAll(".csv-search-result-item[data-index]");
    if (items.length === 0) return;
    items.forEach(item => item.classList.remove("csv-search-result-hover"));
    this.currentSearchIndex = Math.max(0, Math.min(
      items.length - 1,
      this.currentSearchIndex + direction
    ));
    const currentItem = items[this.currentSearchIndex] as HTMLElement;
    if (currentItem) {
      currentItem.classList.add("csv-search-result-hover");
      currentItem.scrollIntoView({ block: "nearest" });
    }
  }

  private selectCurrentSearchResult() {
    if (this.currentSearchIndex >= 0 && this.currentSearchIndex < this.searchMatches.length) {
      const match = this.searchMatches[this.currentSearchIndex];
      this.options.jumpToCell(match.row, match.col);
      this.hideSearchResults();
    }
  }

  private hideSearchResults() {
    this.searchResults.classList.remove("show");
    this.currentSearchIndex = -1;
  }
}
