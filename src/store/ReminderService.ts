import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import { resolveConfiguredStatus, DEFAULT_SETTINGS } from '../settings';
import type { Task } from '../types';
import { localDateString } from '../utils/dateUtils';
import { safeLocalStorage, safeLocalStorageSet } from '../utils/vaultSafe';
import { resolveStaleDate } from './statusChanged';
import { isSnoozed, purgeSnoozed, snoozeTask, type SnoozedState } from './reminderSnooze';
import { NOTICE_DURATION_MS, REMINDER_POLL_INTERVAL_MS, REMINDER_SNOOZE_HOURS, REMINDER_LEAD_DAYS, REMINDER_STALE_DAYS } from '../constants';
import { buildReminderNotice } from './reminderNoticeBuilder';
import { createReminderStorage } from './reminderStorage';
import { evaluateReminders, type ReminderRuleId } from './reminderRules';

export class ReminderService {
	private storage;
	// Namespaced by vault name so multiple vaults on the same device don't collide.
	private get snoozeKey(): string {
		return `ttasks-snoozed-v1-${this.plugin.app.vault.getName()}`;
	}

	constructor(private plugin: TTasksPlugin) {
		this.storage = createReminderStorage(this.plugin.app.vault.getName());
	}

	private loadSnoozed(): SnoozedState {
		try {
			const raw = safeLocalStorage(this.snoozeKey);
			return raw ? JSON.parse(raw) : {};
		} catch { return {}; }
	}

	private saveSnoozed(state: SnoozedState): void {
		safeLocalStorageSet(this.snoozeKey, JSON.stringify(state));
	}

	snooze(path: string, hours: number): void {
		const next = snoozeTask(this.loadSnoozed(), path, hours, new Date());
		this.saveSnoozed(purgeSnoozed(next, new Date()));
	}

	async start(): Promise<void> {
		void this.check();
		this.plugin.registerInterval(
			window.setInterval(() => { void this.check(); }, REMINDER_POLL_INTERVAL_MS)
		);
	}

	// ---------------------------------------------------------------------------
	// Core check loop
	// ---------------------------------------------------------------------------

	private async check(): Promise<void> {
		const r = this.plugin.settings.reminders;
		if (!r.enabled) return;
		const inQuietHours = this.isQuietHours();

		const today = todayString();
		this.storage.clearExpired(today);
		const tasks = get(this.plugin.taskStore.tasks);
		const startStatus = resolveConfiguredStatus(
			this.plugin.settings.statuses,
			this.plugin.settings.quickActions.startStatus,
			DEFAULT_SETTINGS.quickActions.startStatus
		);

		let dirty = false;

		let overdueCount  = 0;
		let dueTodayCount = 0;
		let leadTimeCount = 0;

		const snoozed = this.loadSnoozed();
		const now = new Date();

		for (const task of tasks) {
			if (task.is_complete) continue;
			if (task.reminder_override === 'mute') continue;
			if (inQuietHours && task.reminder_override !== 'urgent') continue;
			if (isSnoozed(snoozed, task.path, now)) continue;

			const reminders = evaluateReminders(
				task,
				today,
				REMINDER_LEAD_DAYS,
				REMINDER_STALE_DAYS,
				startStatus,
			);

			for (const reminder of reminders) {
				if (
					(reminder.ruleId === 'due-today' && !r.ruleDueToday) ||
					(reminder.ruleId === 'overdue' && !r.ruleOverdue) ||
					(reminder.ruleId === 'lead-time' && !r.ruleLeadTime) ||
					(reminder.ruleId === 'stale' && !r.ruleStaleInProgress)
				) {
					continue;
				}

				if (this.storage.hasFired(reminder.taskPath, reminder.ruleId as ReminderRuleId, today)) continue;
				if (reminder.ruleId === 'due-today') {
					dueTodayCount++;
				} else if (reminder.ruleId === 'overdue') {
					overdueCount++;
				} else if (reminder.ruleId === 'lead-time') {
					leadTimeCount++;
				} else {
					this.showReminderNotice(reminder.message, task, true);
				}
				this.storage.markFired(reminder.taskPath, reminder.ruleId as ReminderRuleId, today);
				dirty = true;
			}
		}

		if (overdueCount > 0 || dueTodayCount > 0 || leadTimeCount > 0) {
			const parts: string[] = [];
			if (overdueCount  > 0) parts.push(`${overdueCount} overdue`);
			if (dueTodayCount > 0) parts.push(`${dueTodayCount} due today`);
			if (leadTimeCount > 0) parts.push(`${leadTimeCount} coming up`);
			this.showReminderNotice(parts.join(' · '), null, false);
		}

		if (dirty) return;
	}

	// ---------------------------------------------------------------------------
	// Notices
	// ---------------------------------------------------------------------------

	private showReminderNotice(message: string, task: Task | null, includeSnooze: boolean): void {
		const actions = task && includeSnooze
			? [
				{ label: 'Open', onClick: () => { void this.plugin.openBoard().then(() => this.plugin.activeTaskPath.set(task.path)); } },
				{ label: `Snooze ${REMINDER_SNOOZE_HOURS}h`, onClick: () => this.snooze(task.path, REMINDER_SNOOZE_HOURS) },
			]
			: [{ label: 'Open agenda', onClick: () => { void this.plugin.openBoard().then(() => this.plugin.activeViewMode.set('agenda')); } }];
		buildReminderNotice(`${message}${task ? '' : ' — open agenda'}`, actions, NOTICE_DURATION_MS);
	}

	// ---------------------------------------------------------------------------
	// Quiet hours
	// ---------------------------------------------------------------------------

	private isQuietHours(): boolean {
		const r = this.plugin.settings.reminders;
		if (!r.quietHoursEnabled) return false;
		const hour = new Date().getHours();
		return isInQuietHoursWindow(r.quietStart, r.quietEnd, hour);
	}

	// ---------------------------------------------------------------------------
	// Persistence — localStorage is per-device and does not sync, which is
	// correct for remindersFired: we want each device to show its own reminders
	// regardless of what other devices have already seen.
	// ---------------------------------------------------------------------------
}

// ---------------------------------------------------------------------------
// Pure helpers (no Obsidian API — easy to unit-test)
// ---------------------------------------------------------------------------

function todayString(): string {
	return localDateString();
}

/** Pure: check if `hour` (0–23) falls within a quiet-hours window.
 *  Supports wrap-around ranges (e.g. 22–8 = overnight silence). */
export function isInQuietHoursWindow(quietStart: number, quietEnd: number, hour: number): boolean {
	if (quietStart <= quietEnd) {
		return hour >= quietStart && hour < quietEnd;
	} else {
		return hour >= quietStart || hour < quietEnd;
	}
}

/** Pure: build the deduplication key for a fired reminder. */
export function buildReminderKey(path: string, rule: string, date: string): string {
	return `${path}|${rule}|${date}`;
}

/** Pure: return a new Set with keys for dates before `today` removed. */
export function pruneOldReminderKeys(keys: Set<string>, today: string): Set<string> {
	const result = new Set<string>();
	for (const key of keys) {
		const date = key.split('|')[2];
		if (date !== undefined && date >= today) result.add(key);
	}
	return result;
}

