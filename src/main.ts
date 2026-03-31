import { Plugin } from 'obsidian';
import { type TTasksSettings, DEFAULT_SETTINGS, TTasksSettingTab } from './settings';

export default class TTasksPlugin extends Plugin {
	settings!: TTasksSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new TTasksSettingTab(this.app, this));

		console.log('TTasks loaded');
	}

	onunload() {
		console.log('TTasks unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
