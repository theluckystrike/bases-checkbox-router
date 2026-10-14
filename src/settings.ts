import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { PRO_UI } from './pro';
import type BasesCheckboxRouterPlugin from './main';

export class RouterSettingTab extends PluginSettingTab {
	constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], readonly router: BasesCheckboxRouterPlugin) { super(app, router); }
	getSettingDefinitions(): SettingDefinitionItem[] {
		return this.router.pro ? sponsorsSettingItems(this.router.pro, PRO_UI) : [];
	}
}
