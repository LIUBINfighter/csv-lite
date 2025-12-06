import { i18n } from '../i18n';
import { TableUtils } from '../utils/table-utils';
import { renderTable } from '../view/table-render';

// src/view/header-context-menu.ts
// 表头（行/列）右键菜单逻辑

interface HeaderContextMenuOptions {
  onInsertRowAbove: (rowIndex: number) => void;
  onInsertRowBelow: (rowIndex: number) => void;
  onDeleteRow: (rowIndex: number) => void;
  onMoveRowUp: (rowIndex: number) => void;
  onMoveRowDown: (rowIndex: number) => void;
  onInsertColLeft: (colIndex: number) => void;
  onInsertColRight: (colIndex: number) => void;
  onDeleteCol: (colIndex: number) => void;
  onMoveColLeft: (colIndex: number) => void;
  onMoveColRight: (colIndex: number) => void;
  selectRow?: (rowIndex: number) => void;
  selectColumn?: (colIndex: number) => void;
  clearSelection?: () => void;
  onMenuClose?: () => void;
  onToggleTopRowHeader?: (rowIndex: number) => void;
}

class MenuManager {
  menuEl: HTMLDivElement | null = null;
  outsideHandler: ((e: MouseEvent) => void) | null = null;
  keyHandler: ((e: KeyboardEvent) => void) | null = null;

  showMenu(items: { label: string; onClick: () => void }[], x: number, y: number, onClose?: () => void) {
    this.closeMenu();
    this.menuEl = document.createElement('div');
    this.menuEl.className = 'csv-header-context-menu menu';
    Object.assign(this.menuEl.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      zIndex: '9999',
      minWidth: '160px',
    });
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'menu-item csv-header-context-menu-item';
      div.textContent = i18n.t(item.label) || item.label;
      Object.assign(div.style, {
        padding: '6px 18px',
        cursor: 'pointer',
      });
      div.onclick = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        this.closeMenu();
        item.onClick();
      };
      div.onmouseenter = () => div.classList.add('is-hovered');
      div.onmouseleave = () => div.classList.remove('is-hovered');
      this.menuEl!.appendChild(div);
    });
    document.body.appendChild(this.menuEl);
    // 绑定全局事件
    this.outsideHandler = (e) => {
      if (this.menuEl && !this.menuEl.contains(e.target as Node)) this.closeMenu(onClose);
    };
    this.keyHandler = (e) => {
      if (e.key === 'Escape') this.closeMenu(onClose);
    };
    setTimeout(() => {
      document.addEventListener('mousedown', this.outsideHandler!);
      document.addEventListener('keydown', this.keyHandler!);
    }, 0);
  }
  closeMenu(onClose?: () => void) {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    document.removeEventListener('mousedown', this.outsideHandler!);
    document.removeEventListener('keydown', this.keyHandler!);
    if (onClose) onClose();
  }
}

export function setupHeaderContextMenu(tableEl: HTMLElement, options: HeaderContextMenuOptions): () => void {
  const menuManager = new MenuManager();
  const handler = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    // Allow right-click on row-number cell OR any cell within tbody's tr to open row menu
    const rowTr = target.closest('tr');
    const isRowNumber = target.classList.contains('csv-row-number');
    if (rowTr && rowTr.parentElement && rowTr.parentElement.tagName.toLowerCase() === 'tbody') {
      event.preventDefault();
      const trs = Array.from(rowTr.parentElement.children);
      const rowIndex = trs.indexOf(rowTr);
      if (options.selectRow) options.selectRow(rowIndex);
      const items = [
        { label: 'contextMenu.insertRowAbove', onClick: () => options.onInsertRowAbove(rowIndex) },
        { label: 'contextMenu.insertRowBelow', onClick: () => options.onInsertRowBelow(rowIndex) },
        { label: 'contextMenu.deleteRow', onClick: () => options.onDeleteRow(rowIndex) },
        { label: 'contextMenu.moveRowUp', onClick: () => options.onMoveRowUp(rowIndex) },
        { label: 'contextMenu.moveRowDown', onClick: () => options.onMoveRowDown(rowIndex) },
      ];

      // Only show toggle option when right-clicking the first data row (index 0)
      if (rowIndex === 0 && typeof options.onToggleTopRowHeader === 'function') {
        items.push({
          label: 'contextMenu.toggleTopRowHeader',
          onClick: () => options.onToggleTopRowHeader!(rowIndex),
        });
      }

      menuManager.showMenu(items, event.pageX, event.pageY, () => {
        if (options.clearSelection) options.clearSelection();
        if (options.onMenuClose) options.onMenuClose();
      });
    } else if (target.classList.contains('csv-col-number')) {
      event.preventDefault();
      const ths = Array.from(tableEl.querySelectorAll('.csv-col-number'));
      const colIndex = ths.indexOf(target);
      if (options.selectColumn) options.selectColumn(colIndex);
      const items = [
        { label: 'contextMenu.insertColLeft', onClick: () => options.onInsertColLeft(colIndex) },
        { label: 'contextMenu.insertColRight', onClick: () => options.onInsertColRight(colIndex) },
        { label: 'contextMenu.deleteCol', onClick: () => options.onDeleteCol(colIndex) },
        { label: 'contextMenu.moveColLeft', onClick: () => options.onMoveColLeft(colIndex) },
        { label: 'contextMenu.moveColRight', onClick: () => options.onMoveColRight(colIndex) },
      ];
      menuManager.showMenu(items, event.pageX, event.pageY, () => {
        if (options.clearSelection) options.clearSelection();
        if (options.onMenuClose) options.onMenuClose();
      });
    }
  };
  tableEl.addEventListener('contextmenu', handler);
  return () => {
    tableEl.removeEventListener('contextmenu', handler);
    menuManager.closeMenu();
  };
}
