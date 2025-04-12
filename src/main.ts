import { Plugin, WorkspaceLeaf } from 'obsidian';
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

        // 设置语言 - 使用 Obsidian 的语言设置
        // @ts-ignore - getLanguage方法存在但可能没有在TypeScript定义中正确声明
        const obsidianLang = this.app.getLanguage ? this.app.getLanguage() : navigator.language || "en";
        i18n.setLocale(obsidianLang);

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
