export interface Selection { key: string; value: boolean }
export interface RouteOptions { keys: string[]; rules: string[]; extra: string[]; pro: boolean }
export interface Column { label: string; keys: string[]; rules: string[] }

export function keysFrom(value: unknown): string[] {
	return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean))] : [];
}

/** Only own Boolean properties can be selected. False is a valid value. */
export function select(frontmatter: unknown, keys: string[]): Selection | null {
	if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return null;
	const fm = frontmatter as Record<string, unknown>;
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(fm, key) && typeof fm[key] === 'boolean') return { key, value: fm[key] };
	}
	return null;
}

/** A rule is type=key1,key2. The first exact string type match supplies the keys. */
export function routeKeys(fm: unknown, keys: string[], rules: string[]): string[] {
	if (!fm || typeof fm !== 'object' || !Object.prototype.hasOwnProperty.call(fm, 'type')) return keys;
	const type = (fm as Record<string, unknown>).type;
	if (typeof type !== 'string') return keys;
	for (const rule of rules) {
		const at = rule.indexOf('=');
		if (at < 1 || rule.slice(0, at).trim() !== type) continue;
		const routed = keysFrom(rule.slice(at + 1).split(','));
		if (routed.length) return routed;
	}
	return keys;
}

export function columns(options: RouteOptions): Column[] {
	const result: Column[] = [{ label: 'Status', keys: options.keys, rules: options.pro ? options.rules : [] }];
	if (options.pro) for (const line of options.extra) {
		const at = line.indexOf('=');
		const label = line.slice(0, at).trim();
		const keys = keysFrom(line.slice(at + 1).split(','));
		if (at > 0 && label && keys.length) result.push({ label, keys, rules: [] });
	}
	return result;
}

export class StaleWrite extends Error {
	constructor() { super('The source key or value changed. The row was refreshed. Check it before you try again.'); }
}

/** Call only inside processFrontMatter, against its current object. */
export function applyChange(fm: unknown, column: Column, prior: Selection, next: boolean): void {
	const current = select(fm, routeKeys(fm, column.keys, column.rules));
	if (!current || current.key !== prior.key || current.value !== prior.value) throw new StaleWrite();
	(fm as Record<string, unknown>)[prior.key] = next;
}

/** Shared by views: one write per note, held until fresh file data has been read. */
export class WriteGate<Key = string> {
	readonly pending = new Set<Key>();
	async run(path: Key, write: () => Promise<void>, refresh: () => Promise<void>): Promise<boolean> {
		if (this.pending.has(path)) return false;
		this.pending.add(path);
		try { await write(); }
		finally {
			try { await refresh(); }
			finally { this.pending.delete(path); }
		}
		return true;
	}
}
