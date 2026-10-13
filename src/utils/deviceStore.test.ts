import { describe, expect, it, vi } from 'vitest';
import { DEVICE_KEYS, createDeviceStore, createMemoryDeviceStore, migrateLegacyDeviceStorage } from './deviceStore';

function rawStorage(entries: Record<string, string>) {
	const data = new Map(Object.entries(entries));
	return {
		getItem: (k: string) => data.get(k) ?? null,
		removeItem: (k: string) => { data.delete(k); },
		keys: () => [...data.keys()],
	};
}

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

describe('migrateLegacyDeviceStorage', () => {
	it('moves each old raw key into the vault store and removes it', () => {
		const raw = rawStorage({
			'ttasks-reminders-fired-Work': JSON.stringify(['a|due-today|2026-10-13']),
			'ttasks-snoozed-v1-Work': JSON.stringify({ 'Tasks/a.md': '2026-10-14T00:00:00Z' }),
			'ttasks.mobileQuickCreate': '0',
			'ttasks.mobileQuickCreateHintDismissed': '1',
			'ttasks-reminders-fired-Personal': '[]',
		});
		const store = createMemoryDeviceStore();
		expect(migrateLegacyDeviceStorage(raw, store, 'Work')).toBe(4);
		expect(store.dump()).toEqual({
			[DEVICE_KEYS.remindersFired]: ['a|due-today|2026-10-13'],
			[DEVICE_KEYS.snoozed]: { 'Tasks/a.md': '2026-10-14T00:00:00Z' },
			[DEVICE_KEYS.mobileQuickCreate]: false,
			[DEVICE_KEYS.mobileQuickCreateHintDismissed]: true,
		});
		// The other vault's entry is left for that vault to collect.
		expect(raw.keys()).toEqual(['ttasks-reminders-fired-Personal']);
	});

	it('never overwrites a value already in the new store, and is a no-op the second time', () => {
		const raw = rawStorage({ 'ttasks-snoozed-v1-Work': JSON.stringify({ old: 'x' }) });
		const store = createMemoryDeviceStore({ [DEVICE_KEYS.snoozed]: { kept: 'y' } });
		expect(migrateLegacyDeviceStorage(raw, store, 'Work')).toBe(0);
		expect(store.get(DEVICE_KEYS.snoozed)).toEqual({ kept: 'y' });
		expect(migrateLegacyDeviceStorage(raw, store, 'Work')).toBe(0);
	});

	it('drops a corrupt old entry rather than copying junk', () => {
		const raw = rawStorage({ 'ttasks-snoozed-v1-Work': '{not json' });
		const store = createMemoryDeviceStore();
		migrateLegacyDeviceStorage(raw, store, 'Work');
		expect(store.get(DEVICE_KEYS.snoozed)).toBeNull();
		expect(raw.keys()).toEqual([]);
	});
});
