import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface CSVPluginSettings {
	csvSettings: string;
}

const DEFAULT_SETTINGS: CSVPluginSettings = {
	csvSettings: 'default'
}

export default class CSVPlugin extends Plugin {
	settings: CSVPluginSettings;

	async onload() {
		await this.loadSettings();

	
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

