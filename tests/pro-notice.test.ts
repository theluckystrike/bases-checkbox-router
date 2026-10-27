import { afterEach, expect, it, vi } from 'vitest';
import { App, Notice } from 'obsidian-test-mocks/obsidian';
vi.mock('obsidian', async () => {
	const original = await vi.importActual<typeof import('obsidian-test-mocks/obsidian')>('obsidian-test-mocks/obsidian');
	return { ...original, BasesView: class extends original.Component { app: unknown; constructor(controller: { app: unknown }) { super(); this.app = controller.app; } } };
});
import type { SponsorsManager } from '../src/license/index';
import { RouterView } from '../src/view';
import { WriteGate } from '../src/router';
import { bindPro, resetPro, PRO_OPTIONS } from '../src/pro';

// A free user who enters Note type rules (Pro) or Extra columns (Pro) in the view options gets the shared Pro notice
// with the "Sponsor on GitHub" button. The rules and the extra columns stay inactive and no note changes.
const PITCH = 'Sponsor on GitHub, then sign in from the plugin settings.';

function fakePro(pro: boolean): SponsorsManager {
	return {
		isPro: () => pro,
		onChange: () => () => undefined,
		hasToken: () => false,
		isChecking: () => false,
		getState: () => ({ status: 'unchecked', lastAttemptAt: 0 }),
		config: { sponsorLogin: 'theluckystrike', source: 'bases-checkbox-router' },
	} as unknown as SponsorsManager;
}

afterEach(() => { resetPro(); vi.restoreAllMocks(); });

async function setup(pro: boolean, saved: Record<string, unknown> = {}) {
	bindPro(fakePro(pro));
	const shown: { text: string; buttons: number }[] = [];
	vi.spyOn(Notice.prototype as unknown as { constructor__(): void }, 'constructor__').mockImplementation(function (this: Notice) {
		shown.push({ text: this.messageEl.textContent ?? '', buttons: this.messageEl.querySelectorAll('.pf-pro-notice-sponsor').length });
	});
	const app = App.createConfigured__({ files: { 'Movie.md': '---\ntype: book\nwatched: false\nread: true\n---\nBody stays.\n' } });
	const plugin = { writes: new WriteGate<unknown>(), views: new Set<RouterView>() };
	const view = new RouterView({ app } as never, document.createElement('div'), plugin as never);
	const options: Record<string, unknown> = { routerKeys: ['watched', 'read'], ...saved };
	view.config = { get: (key: string) => options[key] } as never;
	const file = app.vault.getFileByPath('Movie.md')!;
	view.data = { data: [{ file }] } as never;
	view.onload(); await view.refresh();
	return { app, view, file, options, shown };
}
const labels = (view: RouterView) => [...view.root.querySelectorAll('th')].map((th) => th.textContent);

it('a free user who enters a note type rule or an extra column gets the Pro notice with a Sponsor button, and the options stay inactive', async () => {
	const { app, view, file, options, shown } = await setup(false);
	const before = await app.vault.read(file);
	const process = vi.spyOn(app.fileManager, 'processFrontMatter');
	expect(shown).toEqual([]);
	options.routerRules = ['book=read'];
	await view.refresh();
	options.routerColumns = ['Reviewed=reviewed'];
	await view.refresh();
	expect(shown).toEqual([
		{ text: `${PRO_OPTIONS} ${PITCH}Sponsor on GitHub`, buttons: 1 },
		{ text: `${PRO_OPTIONS} ${PITCH}Sponsor on GitHub`, buttons: 1 },
	]);
	// No new notice when the view draws again with the same options.
	view.draw(); await view.refresh();
	expect(shown.length).toBe(2);
	// The free Status column routes by the free key order only, and no note changes.
	expect(labels(view)).toEqual(['Note', 'Status']);
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('data-source-key')).toBe('watched');
	expect(view.root.textContent).toContain('Pro is off. Saved rules and extra columns are inactive.');
	expect(process).not.toHaveBeenCalled();
	expect(await app.vault.read(file)).toBe(before);
	// Removing the options gives no notice.
	options.routerRules = []; options.routerColumns = [];
	await view.refresh();
	expect(shown.length).toBe(2);
});

it('a free user who opens a view with saved Pro options gets no notice until the options change', async () => {
	const { shown, view } = await setup(false, { routerRules: ['book=read'] });
	view.draw();
	expect(shown).toEqual([]);
	expect(view.root.textContent).toContain('Pro is off. Saved rules and extra columns are inactive.');
});

it('a Pro user who enters a note type rule and an extra column gets them with no Pro notice', async () => {
	const { view, options, shown } = await setup(true);
	options.routerRules = ['book=read'];
	options.routerColumns = ['Reviewed=watched'];
	await view.refresh();
	expect(labels(view)).toEqual(['Note', 'Status', 'Reviewed']);
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('data-source-key')).toBe('read');
	expect(shown).toEqual([]);
});
