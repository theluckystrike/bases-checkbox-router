import { afterEach, describe, expect, it, vi } from 'vitest';
import vectors from './vectors/bases-checkbox-router.json';
import { applyChange, columns, keysFrom, routeKeys, select, StaleWrite, WriteGate, type Column } from '../src/router';
import { bindPro, isPro, onProChange, resetPro, SPONSORS } from '../src/pro';

afterEach(resetPro);
const column: Column = { label: 'Status', keys: ['watched', 'read'], rules: [] };

describe('golden acceptance vectors', () => {
	for (const c of vectors.cases.filter(c => c.args[0]?.kind !== 'view')) it(c.name, async () => {
		const [input] = c.args as unknown as [Record<string, any>];
		let result: unknown;
		switch (input.kind) {
			case 'select': result = select(input.fm, input.keys); break;
			case 'write': {
				const fm = structuredClone(input.fm);
				try { applyChange(fm, input.column ?? column, input.prior, input.next); result = { status: 'written', fm }; }
				catch (error) { expect(error).toBeInstanceOf(StaleWrite); result = { status: 'stale', fm }; }
				break;
			}
			case 'rules': result = routeKeys(input.fm, input.keys, input.rules); break;
			case 'columns': result = columns(input.options); break;
			case 'keys': result = keysFrom(input.value); break;
			case 'pending': {
				const gate = new WriteGate();
				let release!: () => void;
				let calls = 0;
				const first = gate.run('Movie.md', async () => { calls++; await new Promise<void>(r => { release = r; }); }, async () => {});
				const second = await gate.run('Movie.md', async () => { calls++; }, async () => {});
				release(); await first;
				result = { calls, second, pending: gate.pending.size }; break;
			}
			case 'error': {
				const gate = new WriteGate(); let refreshed = false;
				try { await gate.run('Movie.md', async () => { throw new Error('disk'); }, async () => { refreshed = gate.pending.has('Movie.md'); }); } catch { /* Expected write error. */ }
				result = { refreshed, pending: gate.pending.size }; break;
			}
			default: throw new Error(`Unknown vector ${input.kind}`);
		}
		expect(result).toEqual(c.expected);
	});
	it('has at least 20 vectors', () => expect(vectors.cases.length).toBeGreaterThanOrEqual(20));
});

it('ignores inherited Boolean properties', () => {
	const fm = Object.assign(Object.create({ watched: true }), { read: false });
	expect(select(fm, column.keys)).toEqual({ key: 'read', value: false });
	expect(() => applyChange(fm, column, { key: 'watched', value: true }, false)).toThrow(StaleWrite);
});
it('holds the guard until the refresh completes', async () => {
	const gate = new WriteGate(); let done!: () => void;
	const refresh = vi.fn(() => new Promise<void>(r => { done = r; }));
	const task = gate.run('A', async () => {}, refresh);
	await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
	expect(gate.pending.has('A')).toBe(true);
	expect(await gate.run('A', async () => {}, async () => {})).toBe(false);
	done(); await task; expect(gate.pending.size).toBe(0);
});
it('clears the guard if refresh fails', async () => {
	const gate = new WriteGate();
	await expect(gate.run('A', async () => {}, async () => { throw Error('read'); })).rejects.toThrow('read');
	expect(gate.pending.size).toBe(0);
});
it('does not change other properties or the selected key on rejection', () => {
	const fm = { watched: 'false', read: true, title: 'Book' };
	expect(() => applyChange(fm, column, { key: 'watched', value: false }, true)).toThrow(StaleWrite);
	expect(fm).toEqual({ watched: 'false', read: true, title: 'Book' });
});
it('gates Pro through the manager and removes listeners', () => {
	let active = false; let notify = () => {}; const off = vi.fn();
	bindPro({ isPro: () => active, onChange: (cb: () => void) => { notify = cb; return off; } } as never);
	const listener = vi.fn(); const remove = onProChange(listener);
	expect(isPro()).toBe(false); active = true; notify();
	expect(isPro()).toBe(true); expect(listener).toHaveBeenCalledOnce();
	remove(); notify(); expect(listener).toHaveBeenCalledOnce(); resetPro();
	expect(off).toHaveBeenCalledOnce(); expect(isPro()).toBe(false);
	expect(SPONSORS).toEqual({ clientId: 'Ov23lic5UPGPZqhBlBGg', sponsorLogin: 'theluckystrike', minMonthlyUsd: 5, oneTimeUsd: 15, oneTimeMonths: 0, scope: 'read:user' });
});

it('writes an own __proto__ property without changing the prototype', () => {
 const fm = JSON.parse('{"__proto__":false}') as Record<string, unknown>;
 applyChange(fm, { label: 'Status', keys: ['__proto__'], rules: [] }, { key: '__proto__', value: false }, true);
 expect(Object.getPrototypeOf(fm)).toBe(Object.prototype);
 expect(Object.getOwnPropertyDescriptor(fm, '__proto__')?.value).toBe(true);
});
