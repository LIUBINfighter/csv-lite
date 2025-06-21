import { i18n } from '../i18n';
import { TableUtils } from '../utils/table-utils';
import { renderTable } from '../view/table-render';

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
    // 关闭已有菜单
    closeMenu();
    // 创建菜单元素
    menuEl = document.createElement('div');
    menuEl.className = 'csv-header-context-menu menu'; // 兼容 obsidian 菜单样式
    Object.assign(menuEl.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      zIndex: '9999',
      minWidth: '160px',
    });
    // 添加菜单项
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
        closeMenu();
        item.onClick();
      };
      div.onmouseenter = () => div.addClass('is-hovered');
      div.onmouseleave = () => div.removeClass('is-hovered');
      menuEl!.appendChild(div);
    });
    // 添加到文档中
    document.body.appendChild(menuEl!);
    // 点击其他地方关闭菜单
    const onClickOutside = (ev: MouseEvent) => {
      if (menuEl && !menuEl.contains(ev.target as Node)) {
        closeMenu();
        document.removeEventListener('click', onClickOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', onClickOutside), 0);
  }
  function closeMenu() {
    menuEl?.remove();
    menuEl = null;
  }

  /**
	 * 确保菜单方法绑定正确
	 */
	function bindMenuMethods(options: HeaderContextMenuOptions) {
		const methods: Array<keyof HeaderContextMenuOptions> = [
			'onInsertRowAbove', 'onInsertRowBelow', 'onDeleteRow', 'onMoveRowUp', 'onMoveRowDown',
			'onInsertColLeft', 'onInsertColRight', 'onDeleteCol', 'onMoveColLeft', 'onMoveColRight'
		];
		methods.forEach(method => {
			if (typeof options[method] !== 'function') {
				throw new Error(`方法 ${method} 未正确绑定`);
			}
		});
	}

	/**
	 * 调试事件绑定问题
	 */
	function debugEventBinding(tableEl: HTMLElement) {
		tableEl.addEventListener('contextmenu', (event) => {
			const target = event.target as HTMLElement;
			console.log('[DEBUG] 触发 contextmenu 事件:', target);
			if (target.classList.contains('csv-row-number')) {
				console.log('[DEBUG] 行号元素被点击:', target);
			}
			if (target.classList.contains('csv-col-number')) {
				console.log('[DEBUG] 列号元素被点击:', target);
			}
		});
	}

	/**
	 * 调试菜单项点击问题
	 */
	function debugMenuItemClick(menuEl: HTMLDivElement) {
		menuEl.querySelectorAll('.csv-header-context-menu-item').forEach(item => {
			item.addEventListener('click', (event) => {
				const target = event.target as HTMLElement;
				console.log('[DEBUG] 菜单项被点击:', target.textContent);
			});
		});
	}

	/**
	 * 确保菜单项事件绑定正确
	 */
	function ensureMenuItemEventBinding(menuEl: HTMLDivElement | null) {
		if (!menuEl) return;
		menuEl.querySelectorAll('.csv-header-context-menu-item').forEach(item => {
			const menuItem = item as HTMLDivElement;
			menuItem.onclick = (event: MouseEvent) => {
				event.stopPropagation();
				const target = event.target as HTMLElement;
				console.log('[DEBUG] 菜单项点击事件触发:', target.textContent);
			};
		});
	}

	// 在菜单创建后确保事件绑定
	ensureMenuItemEventBinding(menuEl);

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
