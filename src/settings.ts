import { PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { sponsorsSettingItems } from './license/github-obsidian';
import { PRO_UI } from './pro';
import type BasesCheckboxRouterPlugin from './main';
import { helloSettingItems } from './hello/settings';

export class RouterSettingTab extends PluginSettingTab {
	constructor(app: ConstructorParameters<typeof PluginSettingTab>[0], readonly router: BasesCheckboxRouterPlugin) { super(app, router); }
	getSettingDefinitions(): SettingDefinitionItem[] {
		// The product rows, then the "More from NoteMods" card (packages/hello).
		return [...this.productSettingDefinitions(), ...helloSettingItems()];
	}

	productSettingDefinitions(): SettingDefinitionItem[] {
		return this.router.pro ? sponsorsSettingItems(this.router.pro, PRO_UI) : [];
	}
}
