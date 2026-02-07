import { App, Modal, Setting, Notice } from 'obsidian';
import { i18n } from '../i18n';

export interface CreateCsvModalOptions {
  defaultFolder?: string;
  onSubmit: (path: string) => Promise<void>;
}

export class CreateCsvModal extends Modal {
  private defaultFolder: string;
  private onSubmit: (path: string) => Promise<void>;
  private fileNameInput!: HTMLInputElement;
  private folderInput!: HTMLInputElement;

  constructor(app: App, options: CreateCsvModalOptions) {
    super(app);
    this.defaultFolder = options.defaultFolder ?? '';
    this.onSubmit = options.onSubmit;
    this.titleEl.setText(i18n.t('commands.createNewCsv'));
  }

  onOpen() {
    const { contentEl } = this;

    // filename setting
    new Setting(contentEl)
      .setName(i18n.t('modal.fileName') || 'File name')
      .setDesc(i18n.t('modal.fileNameDesc') || 'File name (will have .csv appended if missing)')
      .addText((text) => {
        this.fileNameInput = text.inputEl;
        text.setPlaceholder('new-file.csv');
      });

    // folder setting
    new Setting(contentEl)
      .setName(i18n.t('modal.folder') || 'Folder')
      .setDesc(i18n.t('modal.folderDesc') || 'Relative folder inside vault (leave empty for root)')
      .addText((text) => {
        this.folderInput = text.inputEl;
        this.folderInput.value = this.defaultFolder ?? '';
        text.setPlaceholder('Folder/Subfolder');
      });

    // buttons
    const btnContainer = contentEl.createDiv({ cls: 'mod-cta-container' });
    const submitBtn = btnContainer.createEl('button', { text: i18n.t('buttons.create') || 'Create' });
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.handleSubmit();
    });

    const cancelBtn = btnContainer.createEl('button', { text: i18n.t('buttons.cancel') || 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }

  async handleSubmit() {
    const rawName = this.fileNameInput?.value.trim() ?? '';
    let folder = this.folderInput?.value.trim() ?? '';

    if (!rawName) {
      new Notice(i18n.t('modal.errors.missingFileName') || 'Please provide a file name');
      return;
    }

    let name = rawName;
    if (!name.toLowerCase().endsWith('.csv')) {
      name = `${name}.csv`;
    }

    // normalize folder path: remove leading/trailing slashes
    folder = folder.replace(/^\/+|\/+$/g, '');

    const path = folder ? `${folder}/${name}` : name;

    // prevent overwriting existing files
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) {
      new Notice(i18n.t('commands.fileExists') || 'File already exists');
      return;
    }

    try {
      await this.onSubmit(path);
      this.close();
    } catch (err) {
      console.error('CreateCsvModal: failed to create file', err);
      new Notice(i18n.t('modal.errors.createFailed') || 'Failed to create file');
    }
  }
}
