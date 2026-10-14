import vectors from './vectors/bases-checkbox-router.json';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from 'obsidian-test-mocks/obsidian';
vi.mock('obsidian', async () => {
	const original = await vi.importActual<typeof import('obsidian-test-mocks/obsidian')>('obsidian-test-mocks/obsidian');
	return { ...original, BasesView: class extends original.Component { app: unknown; constructor(controller: { app: unknown }) { super(); this.app = controller.app; } } };
});
import { RouterView, viewOptions } from '../src/view';
import { WriteGate } from '../src/router';
import { bindPro, resetPro } from '../src/pro';

afterEach(resetPro);
async function setup(text = '---\nwatched: false\nread: true\n---\nBody stays.\n') {
	const app = App.createConfigured__({ files: { 'Movie.md': text } });
	const plugin = { writes: new WriteGate<unknown>(), views: new Set<RouterView>() };
	const view = new RouterView({ app } as never, document.createElement('div'), plugin as never);
	const options: Record<string, unknown> = { routerKeys: ['watched','read'] };
	view.config = { get: (key: string) => options[key] } as never;
	const file = app.vault.getFileByPath('Movie.md')!;
	view.data = { data: [{ file }] } as never;
	view.onload(); await view.refresh();
	return { app, plugin, view, file, options };
}
it('shows the source key and disabled no-key state', async () => {
	const { view, app, file } = await setup();
	expect(view.root.textContent).toContain('watched');
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-label')).toBe('Movie: Status, watched');
	await app.vault.modify(file, '# No properties'); await view.refresh();
	expect(view.root.textContent).toContain('No valid key');
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-disabled')).toBe('true');
});
it('opens the exact source note without writing it', async () => {
	const { app, view, file } = await setup();
	const openFile = vi.fn().mockResolvedValue(undefined);
	const getLeaf = vi.spyOn(app.workspace, 'getLeaf').mockReturnValue({ openFile } as never);
	const before = await app.vault.read(file);
	view.root.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	expect(getLeaf).toHaveBeenCalledWith(false);
	expect(openFile).toHaveBeenCalledWith(file, { active: true });
	expect(await app.vault.read(file)).toBe(before);
});
it('writes inside processFrontMatter and refreshes from file text', async () => {
	const { app, view, file } = await setup();
	const process = vi.spyOn(app.fileManager, 'processFrontMatter');
	await view.change(file as never, view.getColumns()[0]!, { key: 'watched', value: false }, true);
	expect(process).toHaveBeenCalledOnce();
	expect(await app.vault.read(file)).toContain('watched: true');
	expect(await app.vault.read(file)).toContain('read: true');
	expect(await app.vault.read(file)).toContain('Body stays.');
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-checked')).toBe('true');
});
it.each([
	['value changed', 'watched: true\nread: true'],
	['key deleted', 'read: true'],
	['key became text', 'watched: "false"\nread: true'],
])('stops a stale write when %s', async (_name, fm) => {
	const { app, view, file } = await setup();
	const latest = `---\n${fm}\n---\nBody stays.\n`;
	await app.vault.modify(file, latest);
	await view.change(file as never, view.getColumns()[0]!, { key: 'watched', value: false }, true);
	expect(await app.vault.read(file)).toBe(latest);
	expect(view.root.textContent).toContain('source key or value changed');
});
it('stops when a higher priority property appears', async () => {
	const { app, view, file } = await setup('---\nread: true\n---\nBook');
	const latest = '---\nwatched: false\nread: true\n---\nBook';
	await app.vault.modify(file, latest);
	await view.change(file as never, view.getColumns()[0]!, { key: 'read', value: true }, false);
	expect(await app.vault.read(file)).toBe(latest);
	expect(view.root.textContent).toContain('source key or value changed');
});
it('shows write errors and resets the control', async () => {
	const { app, view, file, plugin } = await setup();
	vi.spyOn(app.fileManager, 'processFrontMatter').mockRejectedValue(new Error('disk full'));
	await view.change(file as never, view.getColumns()[0]!, { key: 'watched', value: false }, true);
	expect(view.root.textContent).toContain('Write failed');
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-checked')).toBe('false');
	expect(plugin.writes.pending.size).toBe(0);
});
it('keeps a control disabled and rejects a second tap during the write', async () => {
	const { app, view, file } = await setup();
	let release!: () => void;
	const process = vi.spyOn(app.fileManager, 'processFrontMatter').mockImplementation(async () => new Promise<void>(r => { release = r; }));
	const first = view.change(file as never, view.getColumns()[0]!, { key: 'watched', value: false }, true);
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-disabled')).toBe('true');
	await view.change(file as never, view.getColumns()[0]!, { key: 'watched', value: false }, true);
	expect(process).toHaveBeenCalledOnce(); release(); await first;
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-disabled')).toBe('false');
});
it('uses Pro rules and columns only with an active manager', async () => {
	const { view, options, app, file } = await setup('---\ntype: book\nwatched: false\nread: true\nreviewed: false\n---\nBook');
	options.routerRules = ['book=read']; options.routerColumns = ['Review=reviewed'];
	view.draw(); expect(view.root.querySelectorAll('th')).toHaveLength(2);
	bindPro({ isPro: () => true, onChange: () => () => {} } as never);
	view.draw(); expect(view.root.querySelectorAll('th')).toHaveLength(3);
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('data-source-key')).toBe('read');
	const before = await app.vault.read(file); const col = view.getColumns()[0]!;
	resetPro(); await view.change(file as never, col, { key: 'read', value: true }, false);
	expect(await app.vault.read(file)).toBe(before);
});
it('uses unique non-reserved Bases option keys', () => {
	expect(viewOptions().map(x => 'key' in x ? x.key : '')).toEqual(['routerKeys','routerRules','routerColumns']);
});

for (const c of vectors.cases.filter(c => c.args[0]?.kind === 'view')) it(c.name, async () => {
 const input = c.args[0] as { fm: string };
 const { app, view } = await setup(`---\n${input.fm}\n---\nBody stays.\n`);
 const opened: unknown[] = [];
 vi.spyOn(app.workspace, 'getLeaf').mockImplementation(((pane: unknown) => ({ openFile: async (f: { path: string }) => { opened.push(f.path, pane); } })) as never);
 const control = view.root.querySelector<HTMLElement>('[data-source-key]')!;
 const link = view.root.querySelector<HTMLAnchorElement>('a')!;
 link.dispatchEvent(new MouseEvent('click', { bubbles: true }));
 expect({ key: control.dataset.sourceKey, label: control.getAttribute('aria-label'), disabled: control.getAttribute('aria-disabled'), href: link.getAttribute('href'), opened }).toEqual(c.expected);
});

it('writes through a type rule and an extra column without creating the fallback key', async () => {
	const { app, view, file, options } = await setup('---\ntype: book\nwatched: false\nread: true\nchecked: false\n---\nBody stays.\n');
	options.routerRules = ['book=read']; options.routerColumns = ['Review=reviewed,checked'];
	bindPro({ isPro: () => true, onChange: () => () => {} } as never);
	await view.change(file as never, view.getColumns()[0]!, { key: 'read', value: true }, false);
	await view.change(file as never, view.getColumns()[1]!, { key: 'checked', value: false }, true);
	const result = await app.vault.read(file);
	expect(result).toContain('watched: false'); expect(result).toContain('read: false');
	expect(result).toContain('checked: true'); expect(result).not.toMatch(/^reviewed:/m);
	expect(result).toContain('Body stays.');
});
it('disables a row when the file read fails', async () => {
	const { app, view } = await setup();
	vi.spyOn(app.vault, 'read').mockRejectedValue(new Error('not readable'));
	await view.refresh();
	expect(view.root.textContent).toContain('Cannot read properties');
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-disabled')).toBe('true');
});
it('cleans up the view when it unloads', async () => {
	const { view, plugin } = await setup(); view.onunload();
	expect(plugin.views.size).toBe(0); expect(view.root.textContent).toBe('');
	await view.refresh(); expect(view.root.textContent).toBe('');
});

it('keeps the same write guard when the source file is renamed', async () => {
 const { app, view, file } = await setup();
 let release!: () => void;
 const process = vi.spyOn(app.fileManager, 'processFrontMatter').mockImplementation(async () => new Promise<void>(r => { release = r; }));
 const first = view.change(file as never, view.getColumns()[0]!, { key: 'watched', value: false }, true);
 await app.vault.rename(file, 'Renamed.md');
 await view.refresh();
 expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-disabled')).toBe('true');
 await view.change(file as never, view.getColumns()[0]!, { key: 'watched', value: false }, true);
 expect(process).toHaveBeenCalledOnce();
 release(); await first;
 expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-disabled')).toBe('false');
});

it('opens the exact TFile when the path contains a heading character', async () => {
	const app = App.createConfigured__({ files: { 'C# notes.md': '---\nread: true\n---\n', 'C.md': 'Other' } });
	const plugin = { writes: new WriteGate<unknown>(), views: new Set<RouterView>() };
	const view = new RouterView({ app } as never, document.createElement('div'), plugin as never);
	view.config = { get: () => undefined } as never;
	const file = app.vault.getFileByPath('C# notes.md')!;
	view.data = { data: [{ file }] } as never;
	view.onload(); await view.refresh();
	// Obsidian parses link text, so "C# notes.md" resolves to the note "C" with a heading subpath.
	vi.spyOn(app.workspace, 'openLinkText').mockImplementation(async (text: string) => {
		const target = app.metadataCache.getFirstLinkpathDest(text.split('#')[0]!, '');
		if (target) await app.workspace.getLeaf(false).openFile(target, { active: true });
	});
	view.root.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await vi.waitFor(() => expect(app.workspace.getActiveFile()?.path).toBe('C# notes.md'));
});
it('does not read non-Markdown files in the base as text', async () => {
	const app = App.createConfigured__({ files: { 'clip.mp4': 'binary', 'Movie.md': '---\nwatched: true\n---\n' } });
	const plugin = { writes: new WriteGate<unknown>(), views: new Set<RouterView>() };
	const view = new RouterView({ app } as never, document.createElement('div'), plugin as never);
	view.config = { get: () => undefined } as never;
	const clip = app.vault.getFileByPath('clip.mp4')!; const movie = app.vault.getFileByPath('Movie.md')!;
	view.data = { data: [{ file: clip }, { file: movie }] } as never;
	const read = vi.spyOn(app.vault, 'read'); const cachedRead = vi.spyOn(app.vault, 'cachedRead');
	view.onload(); await view.refresh();
	expect([...read.mock.calls, ...cachedRead.mock.calls].map(c => (c[0] as { path: string }).path)).toEqual(['Movie.md']);
	expect(view.root.querySelectorAll('[data-source-key]')[0]?.getAttribute('aria-disabled')).toBe('true');
	expect(view.root.querySelectorAll('[data-source-key]')[1]?.getAttribute('data-source-key')).toBe('watched');
});
it('opens the source note in a new tab on Ctrl-click or Cmd-click', async () => {
	const { app, view, file } = await setup();
	const openFile = vi.fn().mockResolvedValue(undefined);
	const getLeaf = vi.spyOn(app.workspace, 'getLeaf').mockReturnValue({ openFile } as never);
	view.root.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, metaKey: true }));
	expect(getLeaf).toHaveBeenCalledWith('tab');
	expect(openFile).toHaveBeenCalledWith(file, { active: true });
});
it('leaves controls inactive when the saved key list is empty', async () => {
	const { view, options } = await setup();
	options.routerKeys = []; view.draw();
	expect(view.root.querySelector('[data-source-key]')?.getAttribute('aria-disabled')).toBe('true');
	expect(view.root.textContent).toContain('No valid key');
});
