import { browser, expect } from '@wdio/globals';
import type Plugin from '../../src/main';
import { pluginId } from './load';

// A free user who enters Note type rules (Pro) in the view options gets the shared Pro notice with the
// "Sponsor on GitHub" button. The rule stays inactive and no note changes. A Pro user gets the rule and no notice.
type Host = { plugins: { plugins: Record<string, Plugin> } };
const base = 'Bases Checkbox Router/Reading list.base';
const LEAD = 'Note type rules and extra columns need Pro.';

async function pro(on: boolean): Promise<void> {
	await browser.executeObsidian(async ({ app }, on) => {
		interface Pro { opts: { http: () => Promise<unknown> }; signOut(): void; refreshNow(): Promise<unknown> }
		const p = (app as unknown as { plugins: { plugins: Record<string, { pro: Pro }> } }).plugins.plugins['bases-checkbox-router']!;
		if (!on) { p.pro.signOut(); return; }
		// Synthetic token and HTTP answer. No network request.
		p.pro.opts.http = async () => ({ status: 200, json: { data: { viewer: { login: 'demo-reader' }, user: { sponsorshipForViewerAsSponsor: { isActive: true, isOneTimePayment: false, tier: { name: '$5 a month', monthlyPriceInCents: 500 } } } } } });
		app.secretStorage.setSecret('bases-checkbox-router-github-token', 'gho_' + '0'.repeat(36));
		await p.pro.refreshNow();
	}, on);
}

async function open(): Promise<void> {
	await browser.executeObsidian(async ({ app }, target) => { await app.workspace.openLinkText(target, '', false); }, `${base}#Routing`);
	await browser.waitUntil(async () => browser.executeObsidian(({ app }) => {
		const p = (app as unknown as Host).plugins.plugins['bases-checkbox-router']!;
		return [...p.views].some(v => v.root.isConnected && v.root.offsetParent !== null && v.root.dataset.viewName === 'Routing' && v.root.querySelectorAll('tbody tr').length === 5);
	}), { timeout: 20000, timeoutMsg: 'The router must show five sample rows.' });
	await browser.executeObsidian(() => { activeDocument.querySelectorAll('.notice').forEach((n) => n.remove()); });
}

/** Sets the Note type rules (Pro) option of the shown view, as the view options editor does, then reads the result. */
async function setRules(rules: string[]) {
	await browser.executeObsidian(({ app }, rules) => {
		const p = (app as unknown as Host).plugins.plugins['bases-checkbox-router']!;
		const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
		v.config.set('routerRules', rules);
	}, rules);
	await browser.pause(1000);
	return browser.executeObsidian(async ({ app }) => {
		const p = (app as unknown as Host).plugins.plugins['bases-checkbox-router']!;
		const v = [...p.views].find(v => v.root.isConnected && v.root.offsetParent !== null)!;
		const row = [...v.root.querySelectorAll<HTMLElement>('tbody tr')].find(r => r.dataset.path === 'Bases Checkbox Router/Notes/Two source keys.md')!;
		const f = app.vault.getFileByPath('Bases Checkbox Router/Notes/Two source keys.md')!;
		return {
			notices: [...activeDocument.querySelectorAll('.notice')].map((n) => ({ text: n.textContent ?? '', sponsor: n.querySelectorAll('.pf-pro-notice-sponsor').length })),
			key: row.querySelector<HTMLElement>('[data-source-key]')!.dataset.sourceKey,
			text: await app.vault.read(f),
			inactive: v.root.textContent?.includes('Pro is off. Saved rules and extra columns are inactive.') ?? false,
		};
	});
}

describe('Pro view options', function () {
	let saved = '';
	before(async () => {
		saved = await browser.executeObsidian(async ({ app }, path) => app.vault.read(app.vault.getFileByPath(path)!), base);
	});
	afterEach(async () => {
		await pro(false);
		await browser.executeObsidian(async ({ app }, path, saved) => { await app.vault.modify(app.vault.getFileByPath(path)!, saved); }, base, saved);
		await browser.pause(500);
	});

	it('a free user who enters a note type rule gets a Pro notice with a Sponsor button, and the rule stays inactive', async () => {
		await pro(false);
		await open();
		const before = await setRules([]);
		expect(before.notices).toEqual([]);
		const after = await setRules(['book=reviewed']);
		if (!after.notices.some((n) => n.text.includes(LEAD) && n.sponsor === 1)) throw new Error(`No Pro notice after the rule: ${JSON.stringify(after.notices)}`);
		// The free key order still selects the same key. Only Pro selects reviewed for a book.
		expect(after.key).toBe(before.key);
		expect(after.key).not.toBe('reviewed');
		expect(after.inactive).toBe(true);
		expect(after.text).toBe(before.text);
	});

	it('a Pro user who enters a note type rule gets the rule, with no Sponsor notice', async () => {
		await pro(true);
		await open();
		const before = await setRules([]);
		const after = await setRules(['book=reviewed']);
		expect(after.key).toBe('reviewed');
		expect(before.key).not.toBe('reviewed');
		expect(after.notices.filter((n) => n.sponsor > 0)).toEqual([]);
	});
});
