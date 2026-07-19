import { describe, expect, it } from 'vitest';
import {
	POMODORO_LOG_HEADER,
	type PomodoroLogEntry,
	csvEscape,
	formatLogRow,
	formatNewLogFile,
} from './pomodoroLog';

const base: PomodoroLogEntry = {
	endedAt: '2026-07-19T10:30:00.000Z',
	mode: 'focus',
	minutes: 25,
	taskPath: 'Tasks/abc123-write-report.md',
	taskName: 'Write report',
};

describe('csvEscape', () => {
	it('leaves plain values untouched', () => {
		expect(csvEscape('Write report')).toBe('Write report');
		expect(csvEscape('')).toBe('');
	});

	it('quotes and doubles quotes for commas, quotes, and newlines', () => {
		expect(csvEscape('a,b')).toBe('"a,b"');
		expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
		expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
	});
});

describe('formatLogRow', () => {
	it('serializes columns in header order', () => {
		expect(formatLogRow(base)).toBe(
			'2026-07-19T10:30:00.000Z,focus,25,Write report,Tasks/abc123-write-report.md,',
		);
	});

	it('emits empty task fields for an untethered session', () => {
		const row = formatLogRow({ ...base, taskPath: null, taskName: null });
		expect(row).toBe('2026-07-19T10:30:00.000Z,focus,25,,,');
	});

	it('escapes a task name containing a comma', () => {
		const row = formatLogRow({ ...base, taskName: 'Write report, part 2' });
		expect(row).toContain('"Write report, part 2"');
	});

	it('includes a note when present', () => {
		const row = formatLogRow({ ...base, note: 'deep work' });
		expect(row.endsWith(',deep work')).toBe(true);
	});
});

describe('formatNewLogFile', () => {
	it('prepends the header and ends with a newline', () => {
		const content = formatNewLogFile(base);
		expect(content.startsWith(`${POMODORO_LOG_HEADER}\n`)).toBe(true);
		expect(content.endsWith('\n')).toBe(true);
		expect(content.split('\n')).toHaveLength(3); // header, row, trailing ''
	});
});
