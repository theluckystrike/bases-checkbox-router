import { BasesView, Keymap, Notice, ToggleComponent, getFrontMatterInfo, parseYaml, type BasesAllOptions, type QueryController, type TFile } from 'obsidian';
import type BasesCheckboxRouterPlugin from './main';
import { isPro, onProChange, proNotice, PRO_OPTIONS } from './pro';
import { applyChange, columns, keysFrom, routeKeys, select, StaleWrite, type Column, type Selection } from './router';

export function viewOptions(): BasesAllOptions[] {
	return [
		{ type: 'multitext', key: 'routerKeys', displayName: 'Property keys in order', default: ['watched', 'read'] },
		{ type: 'multitext', key: 'routerRules', displayName: 'Note type rules (Pro)', default: [] },
		{ type: 'multitext', key: 'routerColumns', displayName: 'Extra columns (Pro)', default: [] },
	];
}
interface Row { file: TFile; fm: unknown; error?: string }

export class RouterView extends BasesView {
	type = 'bases-checkbox-router';
	private rows: Row[] = [];
	private generation = 0;
	private refreshQueue: Promise<void> = Promise.resolve();
	private alive = true;
	private readonly messages = new Map<string, string>();
	/** The Pro view options of the last draw. null before the first draw. */
	private proOptions: string | null = null;
	readonly root: HTMLElement;
	constructor(controller: QueryController, container: HTMLElement, readonly plugin: BasesCheckboxRouterPlugin) {
		super(controller);
		this.root = container.createDiv({ cls: 'bcr-view' });
	}
	onload(): void {
		this.alive = true;
		this.plugin.views.add(this);
		this.register(onProChange(() => this.draw()));
	}
	onunload(): void { this.alive = false; this.generation++; this.plugin.views.delete(this); this.root.empty(); }
	onDataUpdated(): void { void this.refresh(); }
	getColumns(): Column[] {
		return columns({ keys: keysFrom(this.config.get('routerKeys') ?? ['watched', 'read']), rules: keysFrom(this.config.get('routerRules')), extra: keysFrom(this.config.get('routerColumns')), pro: isPro() });
	}
	/** Read the file, not a cache that can still contain the value from before a write. */
	refresh(): Promise<void> {
		this.refreshQueue = this.refreshQueue.then(() => this.readRows());
		return this.refreshQueue;
	}
	private async readRows(): Promise<void> {
		if (!(this.data as BasesView['data'] | undefined)) return;
		const generation = this.generation;
		const rows = await Promise.all(this.data.data.map(async ({ file }): Promise<Row> => {
			// Bases can list every file. Only Markdown has frontmatter; do not load media as text.
			if (file.extension !== 'md') return { file, fm: {} };
			try {
				const content = await this.app.vault.read(file);
				const info = getFrontMatterInfo(content);
				const fm: unknown = info.exists ? parseYaml(info.frontmatter) : {};
				return { file, fm };
			} catch { return { file, fm: null, error: 'Cannot read properties. Check the note and refresh the base.' }; }
		}));
		if (!this.alive || generation !== this.generation) return;
		this.rows = rows;
		this.draw();
	}
	draw(): void {
		if (!this.alive || !(this.data as BasesView['data'] | undefined)) return;
		this.root.empty();
		this.root.dataset.viewName = this.config.name;
		const cols = this.getColumns();
		const header = this.root.createDiv({ cls: 'bcr-header' });
		header.createEl('h3', { text: 'Routed checkboxes' });
		header.createEl('p', { text: `${this.rows.length} notes · First Boolean key in the saved order` });
		const rules = keysFrom(this.config.get('routerRules')); const extra = keysFrom(this.config.get('routerColumns'));
		if (!isPro() && (rules.length || extra.length)) header.createEl('p', { text: 'Pro is off. Saved rules and extra columns are inactive.', cls: 'bcr-muted' });
		// A free user who enters a Pro view option gets the Pro notice once for each change. Opening a view does not show it.
		const proOptions = JSON.stringify([rules, extra]); const prior = this.proOptions; this.proOptions = proOptions;
		if (!isPro() && prior !== null && proOptions !== prior && (rules.length || extra.length)) proNotice(PRO_OPTIONS);
		if (!this.rows.length) { this.root.createEl('p', { text: 'No notes in this base. Check the base filters.' }); return; }
		const table = this.root.createDiv({ cls: 'bcr-scroll' }).createEl('table');
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: 'Note', attr: { scope: 'col' } });
		for (const col of cols) head.createEl('th', { text: col.label, attr: { scope: 'col' } });
		const body = table.createEl('tbody');
		for (const row of this.rows) {
			const tr = body.createEl('tr', { attr: { 'data-path': row.file.path } });
			const cell = tr.createEl('td');
			const link = cell.createEl('a', { text: row.file.basename, cls: 'internal-link', attr: { href: row.file.path } });
			link.addEventListener('click', event => {
				event.preventDefault();
				// Open the file object. Link text parsing would read # or ^ in a path as a subpath.
				void this.app.workspace.getLeaf(Keymap.isModEvent(event)).openFile(row.file, { active: true }).catch(() => new Notice('Cannot open the source note.'));
			});
			cell.createDiv({ text: row.file.path, cls: 'bcr-path' });
			for (const col of cols) this.drawControl(tr.createEl('td'), row, col);
		}
	}
	private drawControl(cell: HTMLElement, row: Row, column: Column): void {
		const chosen = select(row.fm, routeKeys(row.fm, column.keys, column.rules));
		const box = cell.createDiv({ cls: 'bcr-control' });
		const toggle = new ToggleComponent(box).setValue(chosen?.value ?? false).setDisabled(!chosen || this.plugin.writes.pending.has(row.file));
		const label = chosen ? chosen.key : 'No valid key';
		toggle.toggleEl.setAttribute('role', 'checkbox');
		toggle.toggleEl.setAttribute('aria-checked', String(chosen?.value ?? false));
		toggle.toggleEl.setAttribute('aria-disabled', String(!chosen || this.plugin.writes.pending.has(row.file)));
		toggle.toggleEl.setAttribute('aria-label', `${row.file.basename}: ${column.label}, ${label}`);
		toggle.toggleEl.setAttribute('data-source-key', chosen?.key ?? '');
		box.createEl('code', { text: label, cls: chosen ? 'bcr-source' : 'bcr-muted' });
		const message = row.error ?? this.messages.get(row.file.path);
		if (message) {
			const status = cell.createDiv({ cls: 'bcr-message', attr: { role: 'status' } });
			status.createSpan({ text: message });
			if (!row.error) status.createEl('button', { text: 'Dismiss', cls: 'bcr-dismiss' }).addEventListener('click', () => { this.messages.delete(row.file.path); this.draw(); });
		}
		if (this.plugin.writes.pending.has(row.file)) cell.createDiv({ text: 'Saving. Please wait.', cls: 'bcr-muted' });
		toggle.onChange(next => { if (chosen) void this.change(row.file, column, chosen, next); });
	}
	async change(file: TFile, column: Column, prior: Selection, next: boolean): Promise<void> {
		if (this.plugin.writes.pending.has(file)) return;
		this.messages.delete(file.path);
		try {
			await this.plugin.writes.run(file, async () => {
				for (const view of this.plugin.views) view.draw();
				await this.app.fileManager.processFrontMatter(file, (fm: unknown) => {
					const currentColumns = this.getColumns();
					if (!currentColumns.some(c => JSON.stringify(c) === JSON.stringify(column))) throw new StaleWrite();
					applyChange(fm, column, prior, next);
				});
			}, async () => { await Promise.all([...this.plugin.views].map(view => view.refresh())); });
		} catch (error) {
			const message = error instanceof StaleWrite ? error.message : 'Write failed. The row was refreshed. Check the note before you try again.';
			this.messages.set(file.path, message);
			new Notice(message);
		} finally { for (const view of this.plugin.views) view.draw(); }
	}
}
