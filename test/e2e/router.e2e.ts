import { browser, expect } from '@wdio/globals';
import type Plugin from '../../src/main';
import { pluginId, reloadPlugin } from './load';

const base = 'Bases Checkbox Router/Reading list.base';
const dir = 'Bases Checkbox Router/Notes/';
const initial: Record<string, string> = {
	'Arrival': 'type: movie\nwatched: false\nreviewed: true',
	'A field guide': 'type: book\nread: true\nchecked: false',
	'Two source keys': 'type: book\nwatched: false\nread: true\nreviewed: false',
	'Text is not Boolean': 'type: book\nwatched: "false"\nread: true\nchecked: true',
	'Inbox idea': 'type: idea',
};

async function open(name = 'Routing'): Promise<void> {
	await browser.executeObsidian(async ({ app }, target) => { await app.workspace.openLinkText(target, '', false); }, `${base}#${name}`);
	await browser.waitUntil(async () => browser.executeObsidian(({ app }, name) => {
		const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
		return [...p.views].some(v => v.root.isConnected && v.root.offsetParent !== null && v.config.name === name && v.root.dataset.viewName === name && v.root.querySelectorAll('tbody tr').length === 5);
	}, name), { timeout: 20000, timeoutMsg: 'The router must show five sample rows.' });
}
async function pro(on: boolean): Promise<void> {
	await browser.executeObsidian(async ({ app }, on) => {
		interface Pro { opts: { http: () => Promise<unknown> }; signOut(): void; refreshNow(): Promise<unknown> }
		const p = (app as unknown as { plugins: { plugins: Record<string, { pro: Pro }> } }).plugins.plugins['bases-checkbox-router']!;
		if (!on) { p.pro.signOut(); return; }
		p.pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'demo-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
		app.secretStorage.setSecret('bases-checkbox-router-github-token', 'gho_' + '0'.repeat(36));
		await p.pro.refreshNow();
	}, on);
}
async function text(name: string): Promise<string> {
	return browser.executeObsidian(async ({ app }, path) => { const f = app.vault.getFileByPath(path); return f ? app.vault.read(f) : ''; }, `${dir}${name}.md`);
}
async function row(name: string) {
	return browser.executeObsidian(({ app }, path) => {
		const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
		const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
		const row = [...v.root.querySelectorAll<HTMLElement>('tbody tr')].find(r => r.dataset.path === path)!;
		const t = row.querySelector<HTMLElement>('[data-source-key]')!;
		return { key: t.dataset.sourceKey, checked: t.getAttribute('aria-checked'), disabled: t.getAttribute('aria-disabled'), label: t.getAttribute('aria-label'), width: t.getBoundingClientRect().width, height: t.getBoundingClientRect().height, message: row.textContent };
	}, `${dir}${name}.md`);
}
async function click(name: string): Promise<void> {
	await browser.executeObsidian(({ app }, path) => {
		const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
		const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
		const tr = [...v.root.querySelectorAll<HTMLElement>('tbody tr')].find(r => r.dataset.path === path)!;
		tr.querySelector<HTMLElement>('[data-source-key]')!.click();
	}, `${dir}${name}.md`);
	await browser.waitUntil(async () => browser.executeObsidian(({ app }) => (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!.writes.pending.size === 0), { timeout: 10000 });
}

describe(`${pluginId} routed checkboxes`, function () {
	beforeEach(async function () {
		await pro(false);
		await browser.executeObsidian(async ({ app }, data) => {
			document.body.classList.remove('theme-dark');
			document.body.classList.add('theme-light');
			for (const [name, fm] of Object.entries(data)) {
				const f = app.vault.getFileByPath(`Bases Checkbox Router/Notes/${name}.md`)!;
				await app.vault.modify(f, `---\n${fm}\n---\n# ${name}\n\nBody stays.\n`);
			}
		}, initial);
		await open();
		await browser.executeObsidian(async ({ app }) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
			await Promise.all([...p.views].map(v => v.refresh()));
		});
	});
	it('writes the movie key and does not create the book key', async function () {
		expect(await row('Arrival')).toMatchObject({ key: 'watched', checked: 'false', disabled: 'false' });
		await click('Arrival');
		expect(await text('Arrival')).toContain('watched: true');
		expect(await text('Arrival')).not.toMatch(/^read:/m);
		expect(await text('Arrival')).toContain('Body stays.');
		expect(await row('Arrival')).toMatchObject({ key: 'watched', checked: 'true', disabled: 'false' });
	});
	it('clears the book key and keeps a source label', async function () {
		await click('A field guide');
		expect(await text('A field guide')).toContain('read: false');
		expect(await row('A field guide')).toMatchObject({ key: 'read', checked: 'false', label: 'A field guide: Status, read' });
	});
	it('selects false before true and skips text values', async function () {
		expect(await row('Two source keys')).toMatchObject({ key: 'watched', checked: 'false' });
		expect(await row('Text is not Boolean')).toMatchObject({ key: 'read', checked: 'true' });
		await click('Text is not Boolean');
		expect(await text('Text is not Boolean')).toMatch(/watched: ["']false["']/);
		expect(await text('Text is not Boolean')).toContain('read: false');
	});
	it('leaves a note without Boolean keys unchanged', async function () {
		const before = await text('Inbox idea');
		expect(await row('Inbox idea')).toMatchObject({ key: '', disabled: 'true' });
		await click('Inbox idea');
		expect(await text('Inbox idea')).toBe(before);
	});
	for (const [label, fm, prior] of [
		['changed value', 'watched: true', { key: 'watched', value: false }],
		['deleted key', 'read: true', { key: 'watched', value: false }],
		['text key', 'watched: "false"\nread: true', { key: 'watched', value: false }],
		['new earlier key', 'watched: false\nread: true', { key: 'read', value: true }],
	] as const) it(`stops a stale write after ${label}`, async function () {
		const result = await browser.executeObsidian(async ({ app }, input) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
			const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
			const f = app.vault.getFileByPath('Bases Checkbox Router/Notes/Arrival.md')!;
			const content = `---\n${input.fm}\n---\nKeep this body.\n`;
			await app.vault.modify(f, content);
			await v.change(f, v.getColumns()[0]!, input.prior, !input.prior.value);
			return { same: await app.vault.read(f) === content, message: v.root.textContent };
		}, { fm, prior });
		expect(result.same).toBe(true);
		expect(result.message).toContain('source key or value changed');
	});
	it('blocks a second write and reports a write error', async function () {
		const result = await browser.executeObsidian(async ({ app }) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
			const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
			const f = app.vault.getFileByPath('Bases Checkbox Router/Notes/Arrival.md')!;
			const original = app.fileManager.processFrontMatter;
			let release!: () => void; let calls = 0;
			app.fileManager.processFrontMatter = async () => { calls++; await new Promise<void>(r => { release = r; }); throw new Error('Test write error'); };
			try {
				const a = v.change(f, v.getColumns()[0]!, { key: 'watched', value: false }, true);
				const disabled = v.root.querySelector('[data-source-key="watched"]')?.getAttribute('aria-disabled');
				await v.change(f, v.getColumns()[0]!, { key: 'watched', value: false }, true);
				release(); await a;
				return { calls, disabled, message: v.root.textContent, pending: p.writes.pending.size };
			} finally { app.fileManager.processFrontMatter = original; }
		});
		expect(result).toMatchObject({ calls: 1, disabled: 'true', pending: 0 });
		expect(result.message).toContain('Write failed');
		expect(await row('Arrival')).toMatchObject({ checked: 'false', disabled: 'false' });
	});
	it('shows a check mark on checked controls without relying on color', async function () {
		const marker = await browser.executeObsidian(({ app }) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
			const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
			const control = v.root.querySelector('[aria-checked="true"]')!;
			const style = getComputedStyle(control, '::before');
			return { display: style.display, opacity: style.opacity, right: style.borderRightStyle, bottom: style.borderBottomStyle };
		});
		expect(marker).toEqual({ display: 'block', opacity: '1', right: 'solid', bottom: 'solid' });
	});
	it('opens the right note and provides a 44 pixel touch target', async function () {
		const control = await row('Arrival');
		expect(control.width).toBeGreaterThanOrEqual(44); expect(control.height).toBeGreaterThanOrEqual(44);
		await browser.executeObsidian(({ app }) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
			const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
			v.root.querySelector<HTMLElement>('a[href="Bases Checkbox Router/Notes/Arrival.md"]')!.click();
		});
		await browser.waitUntil(async () => browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path === 'Bases Checkbox Router/Notes/Arrival.md'), { timeout: 10000 });
		await open(); await click('Arrival'); expect(await text('Arrival')).toContain('watched: true');
	});
	it('reloads with a base open and restores its controls', async function () {
		expect(await reloadPlugin(pluginId)).toEqual({ enabled: true, reloaded: true, errors: [] });
		await open();
		expect(await row('Arrival')).toMatchObject({ key: 'watched', checked: 'false' });
		await click('Arrival'); expect(await text('Arrival')).toContain('watched: true');
	});
	it('uses saved Pro type rules and extra columns and gates them after sign out', async function () {
		await pro(true); await open('Several columns');
		expect(await row('Two source keys')).toMatchObject({ key: 'read', checked: 'true' });
		const count = () => browser.executeObsidian(({ app }) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
			return [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!.root.querySelectorAll('th').length;
		});
		expect(await count()).toBe(3);
		await click('Two source keys');
		expect(await text('Two source keys')).toContain('read: false');
		expect(await text('Two source keys')).toContain('watched: false');
		await browser.executeObsidian(async ({ app }) => {
			const p = (app as unknown as { plugins: { plugins: Record<string, Plugin> } }).plugins.plugins['bases-checkbox-router']!;
			const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
			const tr = [...v.root.querySelectorAll<HTMLElement>('tbody tr')].find(r => r.dataset.path === 'Bases Checkbox Router/Notes/A field guide.md')!;
			tr.querySelectorAll<HTMLElement>('[data-source-key]')[1]!.click();
		});
		await browser.waitUntil(async () => (await text('A field guide')).includes('checked: true'), { timeout: 10000 });
		expect(await text('A field guide')).not.toMatch(/^reviewed:/m);
		await pro(false);
		expect(await count()).toBe(2);
		expect(await row('Two source keys')).toMatchObject({ key: 'watched', checked: 'false' });
	});
});
