// Pure serializer for the Pomodoro session log. NO Obsidian imports — enforced
// by architectureBoundaries.test.ts. The service layer (main.ts) owns reading /
// appending the actual CSV file in the vault; this module only models a log
// entry and turns it into (and the header for) a CSV row.
//
// CSV is deliberate: append-only, git- and sync-friendly, and readable by any
// tool without the plugin. One row per completed focus session.
//
// Location: the log lives beside the tasks (or in a configured folder), and can
// be split per year or per month so a heavy user's file stays small — the split
// only changes the file *name*, never the columns.

import type { PomodoroMode } from './pomodoro';

export interface PomodoroLogEntry {
	/**
	 * Local ISO-8601 timestamp with UTC offset (e.g. `2026-10-08T14:25:00-05:00`)
	 * of when the session completed — local so the date part is the user's day.
	 */
	endedAt: string;
	/** Phase that completed — always 'focus' today, kept for forward flexibility. */
	mode: PomodoroMode;
	/** Whole minutes of focus logged for this session. */
	minutes: number;
	/** Vault path of the associated task, or null for an untethered session. */
	taskPath: string | null;
	/** Human-readable task name, or null for an untethered session. */
	taskName: string | null;
	/** Optional free-text note (unused today; reserved for a future capture prompt). */
	note?: string | null;
}

/** Column order for the log file. Stable — appended rows must line up with this. */
export const POMODORO_LOG_COLUMNS = ['ended_at', 'mode', 'minutes', 'task_name', 'task_path', 'note'] as const;

/** The CSV header line (no trailing newline). */
export const POMODORO_LOG_HEADER = POMODORO_LOG_COLUMNS.join(',');

/** Escape a single CSV field per RFC 4180: quote when it contains "," '"' or a newline. */
export function csvEscape(value: string): string {
	if (/[",\r\n]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/** Serialize one entry to a CSV row (no trailing newline). */
export function formatLogRow(entry: PomodoroLogEntry): string {
	const fields = [
		entry.endedAt,
		entry.mode,
		String(entry.minutes),
		entry.taskName ?? '',
		entry.taskPath ?? '',
		entry.note ?? '',
	];
	return fields.map((f) => csvEscape(f)).join(',');
}

/**
 * The content to write when the log file does not yet exist: header + first row.
 * Callers that append to an existing file should use `formatLogRow` + a leading
 * newline instead.
 */
export function formatNewLogFile(entry: PomodoroLogEntry): string {
	return `${POMODORO_LOG_HEADER}\n${formatLogRow(entry)}\n`;
}

export type PomodoroLogSplit = 'none' | 'year' | 'month';

/** Base file name of the log; a split appends `-YYYY` or `-YYYY-MM`. */
export const POMODORO_LOG_BASENAME = 'pomodoro-log';

/**
 * Vault-relative path of the log file a session ending on `localDate`
 * (YYYY-MM-DD) belongs in. `folder` is the resolved log folder ('' = vault root).
 */
export function pomodoroLogPath(folder: string, split: PomodoroLogSplit, localDate: string): string {
	const suffix = split === 'year' ? `-${localDate.slice(0, 4)}` : split === 'month' ? `-${localDate.slice(0, 7)}` : '';
	const dir = folder.replace(/^\/+|\/+$/g, '');
	const name = `${POMODORO_LOG_BASENAME}${suffix}.csv`;
	return dir ? `${dir}/${name}` : name;
}
