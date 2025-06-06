import { Plugin, WorkspaceLeaf, moment } from 'obsidian';
import { CSVView, VIEW_TYPE_CSV } from "./view";
import { i18n } from './i18n';

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

        // 使用 moment.locale() 来安全地获取 Obsidian 的当前语言设置
        const obsidianLang = moment.locale();
        i18n.setLocale(obsidianLang);
        console.log(`CSV Plugin: Setting locale to '${obsidianLang}'`);
        console.log(`CSV Plugin: Test translation - buttons.undo: '${i18n.t('buttons.undo')}'`);

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
        // this.app.workspace.detachLeavesOfType(VIEW_TYPE_CSV); // 删除此行
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}
