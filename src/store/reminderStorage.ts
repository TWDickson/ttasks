import { safeLocalStorage, safeLocalStorageSet } from '../utils/vaultSafe';
import type { ReminderRuleId } from './reminderRules';

const STORAGE_PREFIX = 'ttasks-reminders-fired';

export interface ReminderStorage {
	hasFired(taskPath: string, ruleId: ReminderRuleId, date: string): boolean;
	markFired(taskPath: string, ruleId: ReminderRuleId, date: string): void;
	clearExpired(today: string): void;
}

export function buildReminderStorageKey(vaultName: string): string {
	return `${STORAGE_PREFIX}-${vaultName}`;
}

export function createReminderStorage(vaultName: string): ReminderStorage {
	const storageKey = buildReminderStorageKey(vaultName);
	const readState = (): Set<string> => {
		const raw = safeLocalStorage(storageKey);
		if (!raw) return new Set();
		try {
			const parsed: unknown = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
			}
		} catch {
			// Fall through to an empty set when storage is corrupt.
		}
		return new Set();
	};

	let firedKeys = readState();

	const persist = (): void => {
		safeLocalStorageSet(storageKey, JSON.stringify([...firedKeys]));
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