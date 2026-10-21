import { Notice, Plugin, type TFile } from 'obsidian';
import { createGitHubSponsors } from './license/github-obsidian';
import type { SponsorsManager } from './license/index';
import { SPONSORS, bindPro, resetPro } from './pro';
import { WriteGate } from './router';
import { RouterSettingTab } from './settings';
import { RouterView, viewOptions } from './view';
import { setupHello } from './hello/index';
import WHATS_NEW from './whats-new.json';

export default class BasesCheckboxRouterPlugin extends Plugin {
	pro: SponsorsManager | null = null;
	readonly writes = new WriteGate<TFile>();
	readonly views = new Set<RouterView>();
	onload(): void {
		// First: "What's new" reads its state before the settings load (packages/hello). It does not wait.
		setupHello(this, WHATS_NEW);
		const pro = createGitHubSponsors(this.app, this.manifest.id, SPONSORS, this);
		this.pro = pro;
		pro.init();
		bindPro(pro);
		const tab = new RouterSettingTab(this.app, this);
		this.addSettingTab(tab);
		this.register(pro.onChange(() => tab.update()));
		this.registerBasesView('bases-checkbox-router', {
			name: 'Checkbox router', icon: 'list-checks',
			factory: (controller, container) => new RouterView(controller, container, this),
			options: viewOptions,
		});
		this.app.workspace.onLayoutReady(() => {
			void this.reopenStaleBases().catch(() => new Notice('Close and reopen the base to load the checkbox router.'));
			void pro.refresh();
			this.registerInterval(window.setInterval(() => void pro.refresh(), 6 * 60 * 60 * 1000));
		});
	}
	/** Bases can keep a view from the prior plugin instance after a reload. */
	async reopenStaleBases(): Promise<void> {
		for (const leaf of this.app.workspace.getLeavesOfType('bases')) {
			const container = leaf.view.containerEl;
			if (!container.querySelector('.bcr-view') || [...this.views].some(view => container.contains(view.root))) continue;
			const state = leaf.getViewState();
			await leaf.setViewState({ type: 'empty' });
			await leaf.setViewState(state);
		}
	}
	onunload(): void { resetPro(); }
}
