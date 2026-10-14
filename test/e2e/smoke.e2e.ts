import { expect } from '@wdio/globals';
import { pluginId, reloadPlugin } from './load';

describe(`${pluginId} load`, function () {
	it('loads and reloads without errors', async function () {
		expect(await reloadPlugin(pluginId)).toEqual({ enabled: true, reloaded: true, errors: [] });
	});
});
