import { describe, expect, it, vi } from 'vitest';
import { createDeviceStore } from './deviceStore';

describe('createDeviceStore', () => {
	it('goes through the vault-scoped API', () => {
		const app = { loadLocalStorage: vi.fn(() => ['a']), saveLocalStorage: vi.fn() };
		const store = createDeviceStore(app);
		expect(store.get('k')).toEqual(['a']);
		store.set('k', { x: 1 });
		expect(app.saveLocalStorage).toHaveBeenCalledWith('k', { x: 1 });
	});

	it('swallows storage failures and reports them', () => {
		const onError = vi.fn();
		const app = { loadLocalStorage: () => { throw new Error('blocked'); }, saveLocalStorage: () => { throw new Error('quota'); } };
		const store = createDeviceStore(app, onError);
		expect(store.get('k')).toBeNull();
		expect(() => store.set('k', 1)).not.toThrow();
		expect(onError).toHaveBeenCalledTimes(2);
	});

	it('treats undefined as absent', () => {
		expect(createDeviceStore({ loadLocalStorage: () => undefined, saveLocalStorage: () => {} }).get('k')).toBeNull();
	});
});
