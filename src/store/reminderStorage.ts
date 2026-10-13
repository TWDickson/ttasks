import { DEVICE_KEYS, type DeviceStore } from '../utils/deviceStore';
import type { ReminderRuleId } from './reminderRules';

export interface ReminderStorage {
	hasFired(taskPath: string, ruleId: ReminderRuleId, date: string): boolean;
	markFired(taskPath: string, ruleId: ReminderRuleId, date: string): void;
	clearExpired(today: string): void;
}

/** Fired-reminder keys, per device and per vault (PB-2 — see `deviceStore.ts`). */
export function createReminderStorage(store: DeviceStore): ReminderStorage {
	const readState = (): Set<string> => {
		const saved = store.get<unknown>(DEVICE_KEYS.remindersFired);
		return Array.isArray(saved)
			? new Set(saved.filter((entry): entry is string => typeof entry === 'string'))
			: new Set(); // absent or corrupt
	};

	let firedKeys = readState();

	const persist = (): void => {
		store.set(DEVICE_KEYS.remindersFired, [...firedKeys]);
	};

	const makeKey = (taskPath: string, ruleId: ReminderRuleId, date: string): string => {
		return `${taskPath}|${ruleId}|${date}`;
	};

	return {
		hasFired(taskPath, ruleId, date) {
			return firedKeys.has(makeKey(taskPath, ruleId, date));
		},
		markFired(taskPath, ruleId, date) {
			const key = makeKey(taskPath, ruleId, date);
			if (firedKeys.has(key)) return;
			firedKeys.add(key);
			persist();
		},
		clearExpired(today) {
			const next = new Set<string>();
			for (const key of firedKeys) {
				const [, , date] = key.split('|');
				if (date !== undefined && date >= today) {
					next.add(key);
				}
			}
			firedKeys = next;
			persist();
		},
	};
}