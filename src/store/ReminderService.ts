import { Notice } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import { resolveConfiguredStatus, DEFAULT_SETTINGS } from '../settings';
import type { Task } from '../types';
import { localDateString, daysBetweenLocal } from '../utils/dateUtils';
import { resolveStaleDate } from './statusChanged';
import { isSnoozed, purgeSnoozed, snoozeTask, type SnoozedState } from './reminderSnooze';

// Keys are `{path}|{rule}|{YYYY-MM-DD}`.
// Pipe cannot appear in vault paths on any OS and is not used in rule IDs.
type FiredKey = string;

type RuleId = 'due-today' | 'overdue' | 'lead-time' | 'stale';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const NOTICE_DURATION_MS = 8000;

export class ReminderService {
	private firedKeys: Set<FiredKey> = new Set();
	// Namespaced by vault name so multiple vaults on the same device don't collide.
	private get storageKey(): string {
		return `ttasks-reminders-fired-${this.plugin.app.vault.getName()}`;
	}
	private get snoozeKey(): string {
		return `ttasks-snoozed-v1-${this.plugin.app.vault.getName()}`;
	}

	constructor(private plugin: TTasksPlugin) {}

	private loadSnoozed(): SnoozedState {
		try {
			const raw = localStorage.getItem(this.snoozeKey);
			return raw ? JSON.parse(raw) : {};
		} catch { return {}; }
	}

	private saveSnoozed(state: SnoozedState): void {
		localStorage.setItem(this.snoozeKey, JSON.stringify(state));
	}

	snooze(path: string, hours: number): void {
		const next = snoozeTask(this.loadSnoozed(), path, hours, new Date());
		this.saveSnoozed(purgeSnoozed(next, new Date()));
	}

	async start(): Promise<void> {
		this.loadFiredKeys();
		void this.check();
		this.plugin.registerInterval(
			window.setInterval(() => { void this.check(); }, POLL_INTERVAL_MS)
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
		const tasks = get(this.plugin.taskStore.tasks);
		const startStatus = resolveConfiguredStatus(
			this.plugin.settings.statuses,
			this.plugin.settings.quickActions.startStatus,
			DEFAULT_SETTINGS.quickActions.startStatus
		);

		this.pruneStaleKeys(today);

		let dirty = false;

		// Counts for the batched summary notice (date-based rules only).
		let overdueCount  = 0;
		let dueTodayCount = 0;
		let leadTimeCount = 0;

		const snoozed = this.loadSnoozed();
		const now = new Date();

		for (const task of tasks) {
			if (task.is_complete) continue;

			// Per-task override: mute suppresses all reminders
			if (task.reminder_override === 'mute') continue;

			// Quiet hours: skip unless task is marked urgent
			if (inQuietHours && task.reminder_override !== 'urgent') continue;

			// Snooze: skip until snooze expires
			if (isSnoozed(snoozed, task.path, now)) continue;

			// due-today — check before lead-time so we don't double-fire on the same day
			if (r.ruleDueToday && task.due_date === today) {
				if (this.fire(task.path, 'due-today', today)) {
					dueTodayCount++;
					dirty = true;
				}
				// Skip lead-time for this task today — due-today is more specific
				continue;
			}

			// overdue
			if (r.ruleOverdue && task.due_date !== null && task.due_date < today) {
				if (this.fire(task.path, 'overdue', today)) {
					overdueCount++;
					dirty = true;
				}
			}

			// lead-time
			if (r.ruleLeadTime && task.due_date !== null && task.due_date > today) {
					const daysUntilDue = daysBetweenLocal(today, task.due_date);
				if (daysUntilDue <= r.leadTimeDays) {
					if (this.fire(task.path, 'lead-time', today)) {
						leadTimeCount++;
						dirty = true;
					}
				}
			}

			// stale-in-progress — uses status_changed as the anchor date; falls back to
			// start_date for tasks predating the field. If neither is available the rule
			// is silently skipped. Stale fires as an individual notice — soft nudge, not
			// time-critical.
			const staleAnchor = resolveStaleDate(task.status_changed, task.start_date);
			if (
				r.ruleStaleInProgress &&
				task.status === startStatus &&
				staleAnchor !== null
			) {
					const daysInProgress = daysBetweenLocal(staleAnchor, today);
					if (daysInProgress >= r.staleThresholdDays) {
					if (this.fire(task.path, 'stale', today)) {
						this.showNotice(
							`Stale in-progress: ${task.name} (${daysInProgress} day${daysInProgress === 1 ? '' : 's'})`,
							task
						);
						dirty = true;
					}
				}
			}
		}

		// Emit one summary notice for all date-based rules combined.
		if (overdueCount > 0 || dueTodayCount > 0 || leadTimeCount > 0) {
			const parts: string[] = [];
			if (overdueCount  > 0) parts.push(`${overdueCount} overdue`);
			if (dueTodayCount > 0) parts.push(`${dueTodayCount} due today`);
			if (leadTimeCount > 0) parts.push(`${leadTimeCount} coming up`);
			this.showSummaryNotice(parts.join(' · '));
		}

		if (dirty) this.saveFiredKeys();
	}

	// ---------------------------------------------------------------------------
	// Notices
	// ---------------------------------------------------------------------------

	/** One-liner summary that opens the agenda view on click. */
	private showSummaryNotice(summary: string): void {
		const frag = document.createDocumentFragment();
		const span = frag.createEl('span', { text: `${summary} — open agenda` });
		span.style.cursor = 'pointer';

		const notice = new Notice(frag, NOTICE_DURATION_MS);
		notice.noticeEl.style.cursor = 'pointer';
		notice.noticeEl.addEventListener('click', () => {
			notice.hide();
			void this.plugin.openBoard().then(() => {
				this.plugin.activeViewMode.set('agenda');
			});
		});
	}

	/** Individual notice for a single task — used for stale-in-progress. */
	private showNotice(message: string, task: Task): void {
		const frag = document.createDocumentFragment();
		const span = frag.createEl('span', { text: message });
		span.style.cursor = 'pointer';

		// Snooze button: dismiss this task's reminders for 4 hours
		const snoozeBtn = frag.createEl('button', { text: 'Snooze 4h' });
		snoozeBtn.style.cssText = 'margin-left:8px;font-size:0.75rem;padding:2px 6px;border-radius:4px;cursor:pointer;';
		snoozeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.snooze(task.path, 4);
			notice.hide();
		});

		const notice = new Notice(frag, NOTICE_DURATION_MS);
		notice.noticeEl.style.cursor = 'pointer';
		notice.noticeEl.addEventListener('click', () => {
			notice.hide();
			void this.plugin.openBoard().then(() => {
				this.plugin.activeTaskPath.set(task.path);
			});
		});
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
	// Deduplication helpers
	// ---------------------------------------------------------------------------

	private makeKey(path: string, rule: RuleId, date: string): FiredKey {
		return buildReminderKey(path, rule, date);
	}

	/** Returns true and marks the key if this reminder has not yet fired today. */
	private fire(path: string, rule: RuleId, date: string): boolean {
		const key = this.makeKey(path, rule, date);
		if (this.firedKeys.has(key)) return false;
		this.firedKeys.add(key);
		return true;
	}

	/** Remove keys for dates older than today to keep the stored set bounded. */
	private pruneStaleKeys(today: string): void {
		this.firedKeys = pruneOldReminderKeys(this.firedKeys, today);
	}

	// ---------------------------------------------------------------------------
	// Persistence — localStorage is per-device and does not sync, which is
	// correct for remindersFired: we want each device to show its own reminders
	// regardless of what other devices have already seen.
	// ---------------------------------------------------------------------------

	private loadFiredKeys(): void {
		try {
			const raw = localStorage.getItem(this.storageKey);
			if (raw) {
				const parsed: unknown = JSON.parse(raw);
				if (Array.isArray(parsed)) {
					this.firedKeys = new Set(parsed.filter((k): k is string => typeof k === 'string'));
				}
			}
		} catch {
			// Corrupt or missing — start fresh
			this.firedKeys = new Set();
		}
	}

	private saveFiredKeys(): void {
		try {
			localStorage.setItem(this.storageKey, JSON.stringify([...this.firedKeys]));
		} catch {
			// Storage quota exceeded or unavailable — non-fatal, worst case a reminder
			// re-fires next poll cycle
		}
	}
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

