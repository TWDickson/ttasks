import { Notice } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from './main';
import { resolveConfiguredStatus, DEFAULT_SETTINGS } from './settings';
import type { Task } from './types';
import { localDateString, daysBetweenLocal } from './utils/dateUtils';

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

	constructor(private plugin: TTasksPlugin) {}

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
		if (this.isQuietHours()) return;

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

		for (const task of tasks) {
			if (task.is_complete) continue;

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

			// stale-in-progress — uses start_date as a proxy for when the task was started.
			// If start_date is null (e.g. status set via quick-action without a start date), the
			// rule is silently skipped. A future schema addition (status_changed field) would
			// make this more reliable.
			// Stale fires as an individual notice — it's a soft nudge, not time-critical.
			if (
				r.ruleStaleInProgress &&
				task.status === startStatus &&
				task.start_date !== null
			) {
					const daysInProgress = daysBetweenLocal(task.start_date, today);
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
		const hour = new Date().getHours(); // 0–23 local time
		if (r.quietStart <= r.quietEnd) {
			// e.g. 9–17: quiet during a daytime window
			return hour >= r.quietStart && hour < r.quietEnd;
		} else {
			// e.g. 22–8: wraps midnight
			return hour >= r.quietStart || hour < r.quietEnd;
		}
	}

	// ---------------------------------------------------------------------------
	// Deduplication helpers
	// ---------------------------------------------------------------------------

	private makeKey(path: string, rule: RuleId, date: string): FiredKey {
		return `${path}|${rule}|${date}`;
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
		for (const key of this.firedKeys) {
			const date = key.split('|')[2];
			if (date !== undefined && date < today) {
				this.firedKeys.delete(key);
			}
		}
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

