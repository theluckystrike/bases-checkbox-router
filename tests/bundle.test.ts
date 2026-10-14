import { build } from 'esbuild';
import { expect, it } from 'vitest';

it('keeps script creation code and setImmediate polyfills out of the runtime bundle', async () => {
	const result = await build({
		absWorkingDir: process.cwd(),
		entryPoints: ['src/main.ts'],
		bundle: true,
		external: ['obsidian'],
		platform: 'browser',
		format: 'cjs',
		target: 'es2021',
		minify: true,
		write: false,
	});
	const bundle = result.outputFiles[0]!.text;
	expect(bundle).not.toMatch(/\bcreateElement\s*\(\s*(['"])script\1\s*\)/);
	expect(bundle).not.toMatch(/\bsetImmediate\b/);
});
