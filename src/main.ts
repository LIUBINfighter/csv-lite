import { App, Editor, MarkdownView, Modal, Notice, Plugin, Setting, WorkspaceLeaf } from 'obsidian';
import { CSVView, VIEW_TYPE_CSV } from "./view";
import { i18n, Locale } from './i18n';

interface CSVPluginSettings {
	csvSettings: string;
	locale: Locale; // 添加语言设置
}

const DEFAULT_SETTINGS: CSVPluginSettings = {
	csvSettings: 'default',
	locale: 'en' // 默认使用英文
}

export default class CSVPlugin extends Plugin {
	settings: CSVPluginSettings;

	async onload() {
		await this.loadSettings();
		
		// 设置语言
		i18n.setLocale(this.settings.locale);
		
		// 注册CSV视图类型
		this.registerView(
			VIEW_TYPE_CSV,
			(leaf: WorkspaceLeaf) => new CSVView(leaf)
		);
		
		// 将.csv文件扩展名与视图类型绑定
		this.registerExtensions(["csv"], VIEW_TYPE_CSV);
		
	}

	onunload() {
		// 移除视图
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CSV);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
