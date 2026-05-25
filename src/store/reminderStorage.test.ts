import { afterEach, describe, expect, it } from 'vitest';
import { buildReminderStorageKey, createReminderStorage } from './reminderStorage';

type StorageMap = Record<string, string>;

const originalLocalStorage = globalThis.localStorage;
let storage: StorageMap;

function installLocalStorageMock(throwOnAccess = false): void {
	storage = {};
	const mock = {
		getItem(key: string) {
			if (throwOnAccess) throw new Error('blocked');
			return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
		},
		setItem(key: string, value: string) {
			if (throwOnAccess) throw new Error('blocked');
			storage[key] = value;
		},
		removeItem(key: string) {
			delete storage[key];
		},
		clear() {
			storage = {};
		},
	};
	Object.defineProperty(globalThis, 'localStorage', {
		value: mock,
		configurable: true,
		writable: true,
	});
}

afterEach(() => {
	Object.defineProperty(globalThis, 'localStorage', {
		value: originalLocalStorage,
		configurable: true,
		writable: true,
	});
});

describe('reminder storage', () => {
	it('returns false for unseen keys', () => {
		installLocalStorageMock();
		const reminderStorage = createReminderStorage('Vault');
		expect(reminderStorage.hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(false);
	});

	it('returns true after markFired', () => {
		installLocalStorageMock();
		const reminderStorage = createReminderStorage('Vault');
		reminderStorage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		expect(reminderStorage.hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(true);
	});

	it('does not confuse different dates', () => {
		installLocalStorageMock();
		const reminderStorage = createReminderStorage('Vault');
		reminderStorage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		expect(reminderStorage.hasFired('Tasks/a.md', 'overdue', '2026-05-26')).toBe(false);
	});

	it('markFired is idempotent', () => {
		installLocalStorageMock();
		const reminderStorage = createReminderStorage('Vault');
		reminderStorage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		reminderStorage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		expect(JSON.parse(storage[buildReminderStorageKey('Vault')])).toEqual(['Tasks/a.md|overdue|2026-05-25']);
	});

	it('clearExpired removes keys before today', () => {
		installLocalStorageMock();
		const reminderStorage = createReminderStorage('Vault');
		reminderStorage.markFired('Tasks/a.md', 'overdue', '2026-05-20');
		reminderStorage.markFired('Tasks/b.md', 'lead-time', '2026-05-25');
		reminderStorage.clearExpired('2026-05-25');
		expect(reminderStorage.hasFired('Tasks/a.md', 'overdue', '2026-05-20')).toBe(false);
		expect(reminderStorage.hasFired('Tasks/b.md', 'lead-time', '2026-05-25')).toBe(true);
	});

	it('keeps keys for today', () => {
		installLocalStorageMock();
		const reminderStorage = createReminderStorage('Vault');
		reminderStorage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		reminderStorage.clearExpired('2026-05-25');
		expect(reminderStorage.hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(true);
	});

	it('works when localStorage is unavailable', () => {
		installLocalStorageMock(true);
		const reminderStorage = createReminderStorage('Vault');
		expect(() => reminderStorage.markFired('Tasks/a.md', 'overdue', '2026-05-25')).not.toThrow();
		expect(reminderStorage.hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(true);
	});

	it('does not duplicate keys across multiple init calls', () => {
		installLocalStorageMock();
		const first = createReminderStorage('Vault');
		first.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		const second = createReminderStorage('Vault');
		expect(second.hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(true);
		expect(JSON.parse(storage[buildReminderStorageKey('Vault')])).toEqual(['Tasks/a.md|overdue|2026-05-25']);
	});
});