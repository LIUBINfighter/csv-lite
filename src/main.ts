import { Plugin, WorkspaceLeaf, moment, TFile, Notice } from "obsidian";
import { CSVView, VIEW_TYPE_CSV } from "./view";
import { SourceView, VIEW_TYPE_CSV_SOURCE } from "./source-view";
import { i18n } from "./i18n";
import { FileUtils } from "./utils/file-utils";

interface CSVPluginSettings {
	csvSettings: string;
	preferredDelimiter?: string; // user global preference, e.g. ',' ';' '\t' or 'auto'
}

const DEFAULT_SETTINGS: CSVPluginSettings = {
	csvSettings: "default",
	preferredDelimiter: 'auto',
};

export default class CSVPlugin extends Plugin {
	settings: CSVPluginSettings;

	async onload() {
		await this.loadSettings();

		// 使用 moment.locale() 来安全地获取 Obsidian 的当前语言设置
		const obsidianLang = moment.locale();
		i18n.setLocale(obsidianLang);
		console.log(`CSV Plugin: Setting locale to '${obsidianLang}'`);
		console.log(
			`CSV Plugin: Test translation - buttons.undo: '${i18n.t(
				"buttons.undo"
			)}'`
		);

		// 注册CSV视图类型
		this.registerView(
			VIEW_TYPE_CSV,
			(leaf: WorkspaceLeaf) => new CSVView(leaf)
		);

		// 注册源码视图类型
		this.registerView(
			VIEW_TYPE_CSV_SOURCE,
			(leaf: WorkspaceLeaf) => new SourceView(leaf)
		);

		// 将.csv文件扩展名与视图类型绑定
		this.registerExtensions(["csv"], VIEW_TYPE_CSV);

		// Command: create new csv file (from command palette) — direct creation, no modal
		this.addCommand({
			id: 'csv-lite-create-new-csv-file',
			name: i18n.t('commands.createNewCsv'),
			callback: () => {
				this.createCsvInFolder('');
			}
		});

		// File explorer context menu: create csv file inside folder or next to file — direct creation
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				menu.addItem((item) => {
					item.setTitle(i18n.t('contextMenu.createNewCsv') || i18n.t('commands.createNewCsv'))
						.setIcon('file-plus')
						.onClick(() => {
							let defaultFolder = '';
							if ((file as any).path) {
								const fp = (file as any).path as string;
								// if path has a slash, take parent folder
								const idx = fp.lastIndexOf('/');
								if (idx > 0) defaultFolder = fp.substring(0, idx);
							}
							this.createCsvInFolder(defaultFolder);
						});
				});
			})
		);
	}

	// Create a new CSV in the given folder with an auto-incremented name if necessary
	private async createCsvInFolder(folder: string) {
		const baseName = 'new.csv';
		let name = baseName;
		let idx = 0;

		while (this.app.vault.getAbstractFileByPath(folder ? `${folder}/${name}` : name)) {
			idx++;
			name = `new-${idx}.csv`;
			if (idx > 1000) {
				new Notice(i18n.t('modal.errors.createFailed') || 'Failed to create file');
				return null;
			}
		}

		const path = folder ? `${folder}/${name}` : name;

		try {
			await FileUtils.withRetry(() => this.app.vault.create(path, ''));
			const created = this.app.vault.getAbstractFileByPath(path) as TFile | null;
			if (created) {
				await this.app.workspace.getLeaf(true).openFile(created);
			}
			return created;
		} catch (err) {
			console.error('CreateCsv: failed to create file', err);
			new Notice(i18n.t('modal.errors.createFailed') || 'Failed to create file');
			return null;
		}
	}

	onunload() {
		// 移除视图
		// this.app.workspace.detachLeavesOfType(VIEW_TYPE_CSV); // 删除此行
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
