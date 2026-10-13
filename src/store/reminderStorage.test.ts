import { describe, expect, it } from 'vitest';
import { createReminderStorage } from './reminderStorage';
import { DEVICE_KEYS, createDeviceStore, createMemoryDeviceStore } from '../utils/deviceStore';

describe('reminder storage', () => {
	it('returns false for unseen keys', () => {
		expect(createReminderStorage(createMemoryDeviceStore()).hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(false);
	});

	it('returns true after markFired', () => {
		const storage = createReminderStorage(createMemoryDeviceStore());
		storage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		expect(storage.hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(true);
	});

	it('does not confuse different dates', () => {
		const storage = createReminderStorage(createMemoryDeviceStore());
		storage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		expect(storage.hasFired('Tasks/a.md', 'overdue', '2026-05-26')).toBe(false);
	});

	it('markFired is idempotent and persists a plain list', () => {
		const store = createMemoryDeviceStore();
		const storage = createReminderStorage(store);
		storage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		storage.markFired('Tasks/a.md', 'overdue', '2026-05-25');
		expect(store.get(DEVICE_KEYS.remindersFired)).toEqual(['Tasks/a.md|overdue|2026-05-25']);
	});

	it('clearExpired removes keys before today and keeps today\'s', () => {
		const storage = createReminderStorage(createMemoryDeviceStore());
		storage.markFired('Tasks/a.md', 'overdue', '2026-05-20');
		storage.markFired('Tasks/b.md', 'lead-time', '2026-05-25');
		storage.clearExpired('2026-05-25');
		expect(storage.hasFired('Tasks/a.md', 'overdue', '2026-05-20')).toBe(false);
		expect(storage.hasFired('Tasks/b.md', 'lead-time', '2026-05-25')).toBe(true);
	});

	it('picks up what an earlier instance saved', () => {
		const store = createMemoryDeviceStore();
		createReminderStorage(store).markFired('Tasks/a.md', 'overdue', '2026-05-25');
		expect(createReminderStorage(store).hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(true);
	});

	it('ignores a corrupt saved value', () => {
		const store = createMemoryDeviceStore({ [DEVICE_KEYS.remindersFired]: 'not a list' });
		expect(createReminderStorage(store).hasFired('x', 'overdue', '2026-05-25')).toBe(false);
	});

	it('keeps working in memory when storage is unavailable', () => {
		const broken = createDeviceStore({
			loadLocalStorage: () => { throw new Error('blocked'); },
			saveLocalStorage: () => { throw new Error('blocked'); },
		});
		const storage = createReminderStorage(broken);
		expect(() => storage.markFired('Tasks/a.md', 'overdue', '2026-05-25')).not.toThrow();
		expect(storage.hasFired('Tasks/a.md', 'overdue', '2026-05-25')).toBe(true);
	});
});
