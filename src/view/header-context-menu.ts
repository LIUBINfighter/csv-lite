import { i18n } from '../i18n';

// src/view/header-context-menu.ts
// 表头（行/列）右键菜单逻辑

interface HeaderContextMenuOptions {
  tableEl: HTMLElement;
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
}

export function setupHeaderContextMenu(options: HeaderContextMenuOptions): () => void {
  const { tableEl } = options;
  let menuEl: HTMLDivElement | null = null;

  // 创建菜单
  function createMenu(items: { label: string; onClick: () => void }[], x: number, y: number) {
    if (menuEl) {
      menuEl.remove();
    }
    menuEl = document.createElement('div');
    menuEl.className = 'csv-header-context-menu menu'; // 兼容 obsidian 菜单样式
    Object.assign(menuEl.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      zIndex: '9999',
      minWidth: '160px',
      background: 'var(--menu-background, var(--background-primary))',
      border: '1px solid var(--background-modifier-border)',
      borderRadius: 'var(--radius-m)',
      boxShadow: 'var(--shadow-s)',
      padding: '4px 0',
      color: 'var(--text-normal)',
      fontSize: 'var(--font-ui-small)',
      fontFamily: 'var(--font-interface)',
    });
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'csv-header-context-menu-item menu-item';
      div.textContent = i18n.t(item.label); // 使用i18n
      Object.assign(div.style, {
        padding: '6px 18px',
        cursor: 'pointer',
        border: 'none',
        background: 'none',
        color: 'inherit',
        borderRadius: 'var(--radius-s)',
        transition: 'background 0.15s',
      });
      div.onmouseenter = () => div.style.background = 'var(--background-modifier-hover)';
      div.onmouseleave = () => div.style.background = '';
      div.onclick = (e) => {
        e.stopPropagation();
        try {
          item.onClick();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[CSV-Lite] 菜单项点击异常:', item.label, err);
          alert('[CSV-Lite] 菜单项点击异常: ' + item.label + '\n' + (err?.message || err));
        }
        menuEl?.remove();
      };
      menuEl!.appendChild(div);
    });
    document.body.appendChild(menuEl);
    // 点击其他地方关闭
    setTimeout(() => {
      document.addEventListener('mousedown', closeMenu, { once: true });
    }, 0);
  }
  function closeMenu() {
    menuEl?.remove();
    menuEl = null;
  }

  // 监听表头右键
  const handler = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('csv-row-number')) {
      event.preventDefault();
      // 更健壮的行索引计算
      const tr = target.closest('tr');
      if (!tr) return;
      const trs = Array.from(tr.parentElement!.children);
      const rowIndex = trs.indexOf(tr);
      createMenu([
        { label: 'contextMenu.insertRowAbove', onClick: () => options.onInsertRowAbove(rowIndex) },
        { label: 'contextMenu.insertRowBelow', onClick: () => options.onInsertRowBelow(rowIndex) },
        { label: 'contextMenu.deleteRow', onClick: () => options.onDeleteRow(rowIndex) },
        { label: 'contextMenu.moveRowUp', onClick: () => options.onMoveRowUp(rowIndex) },
        { label: 'contextMenu.moveRowDown', onClick: () => options.onMoveRowDown(rowIndex) },
      ], event.pageX, event.pageY);
    }
    if (target.classList.contains('csv-col-number')) {
      event.preventDefault();
      // 更健壮的列索引计算
      const ths = Array.from(tableEl.querySelectorAll('.csv-col-number'));
      const colIndex = ths.indexOf(target);
      createMenu([
        { label: 'contextMenu.insertColLeft', onClick: () => options.onInsertColLeft(colIndex) },
        { label: 'contextMenu.insertColRight', onClick: () => options.onInsertColRight(colIndex) },
        { label: 'contextMenu.deleteCol', onClick: () => options.onDeleteCol(colIndex) },
        { label: 'contextMenu.moveColLeft', onClick: () => options.onMoveColLeft(colIndex) },
        { label: 'contextMenu.moveColRight', onClick: () => options.onMoveColRight(colIndex) },
      ], event.pageX, event.pageY);
    }
  };
  tableEl.addEventListener('contextmenu', handler);

  // 返回解绑函数
  return () => {
    tableEl.removeEventListener('contextmenu', handler);
  };
}
