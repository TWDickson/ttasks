import { describe, expect, it } from 'vitest';
import {
	deriveArchiveFolder,
	getArchivePath,
	isArchivedPath,
	daysBetween,
	archiveEligible,
} from './archiveUtils';

describe('deriveArchiveFolder', () => {
	it('replaces last segment with Archive for nested folder', () => {
		expect(deriveArchiveFolder('Planner/Tasks')).toBe('Planner/Archive');
	});

	it('returns Archive for root-level tasks folder', () => {
		expect(deriveArchiveFolder('Tasks')).toBe('Archive');
	});

	it('handles trailing slash gracefully', () => {
		expect(deriveArchiveFolder('Planner/Tasks/')).toBe('Planner/Archive');
	});

	it('handles deeply nested folder', () => {
		expect(deriveArchiveFolder('Vault/Planning/Tasks')).toBe('Vault/Planning/Archive');
	});
});

describe('getArchivePath', () => {
	it('produces the correct path for a given date', () => {
		const date = new Date(2026, 4, 14); // May 14 2026 (month is 0-indexed)
		expect(getArchivePath('Planner/Archive', 'abc123-task.md', date))
			.toBe('Planner/Archive/2026/05/abc123-task.md');
	});

	it('zero-pads single-digit months', () => {
		const date = new Date(2026, 0, 1); // January
		expect(getArchivePath('Planner/Archive', 'task.md', date))
			.toBe('Planner/Archive/2026/01/task.md');
	});

	it('works for December', () => {
		const date = new Date(2026, 11, 31); // December
		expect(getArchivePath('Archive', 'task.md', date))
			.toBe('Archive/2026/12/task.md');
	});
});

describe('isArchivedPath', () => {
	it('returns true for paths inside archive folder', () => {
		expect(isArchivedPath('Planner/Archive/2026/05/abc.md', 'Planner/Archive')).toBe(true);
	});

	it('returns false for active tasks path', () => {
		expect(isArchivedPath('Planner/Tasks/abc.md', 'Planner/Archive')).toBe(false);
	});

	it('handles trailing slash on archiveFolder', () => {
		expect(isArchivedPath('Planner/Archive/2026/05/abc.md', 'Planner/Archive/')).toBe(true);
	});

	it('does not false-positive on prefix substring matches', () => {
		// 'Planner/ArchiveOther/...' should not match 'Planner/Archive'
		expect(isArchivedPath('Planner/ArchiveOther/task.md', 'Planner/Archive')).toBe(false);
	});
});

describe('daysBetween', () => {
	it('returns 0 for same date', () => {
		expect(daysBetween('2026-05-14', '2026-05-14')).toBe(0);
	});

	it('returns correct positive count', () => {
		expect(daysBetween('2026-05-01', '2026-05-14')).toBe(13);
	});

	it('returns negative for past-to-future reversed', () => {
		expect(daysBetween('2026-05-14', '2026-05-01')).toBe(-13);
	});

	it('handles month boundaries correctly', () => {
		expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
	});

	it('handles year boundaries correctly', () => {
		expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
	});
});

describe('archiveEligible', () => {
	it('returns false for incomplete tasks', () => {
		expect(archiveEligible(
			{ is_complete: false, status_changed: '2026-01-01', completed: '2026-01-01' },
			45,
			'2026-05-14',
		)).toBe(false);
	});

	it('returns false when task completed less than threshold days ago', () => {
		expect(archiveEligible(
			{ is_complete: true, status_changed: '2026-05-01', completed: '2026-05-01' },
			45,
			'2026-05-14',
		)).toBe(false); // only 13 days
	});

	it('returns true when task completed exactly threshold days ago', () => {
		expect(archiveEligible(
			{ is_complete: true, status_changed: '2026-03-30', completed: '2026-03-30' },
			45,
			'2026-05-14',
		)).toBe(true); // exactly 45 days
	});

	it('returns true when task completed more than threshold days ago', () => {
		expect(archiveEligible(
			{ is_complete: true, status_changed: '2026-01-01', completed: '2026-01-01' },
			45,
			'2026-05-14',
		)).toBe(true);
	});

	it('uses status_changed as anchor over completed', () => {
		// status_changed is recent (13 days) — not eligible
		// completed is old (133 days) — would be eligible without the override
		expect(archiveEligible(
			{ is_complete: true, status_changed: '2026-05-01', completed: '2026-01-01' },
			45,
			'2026-05-14',
		)).toBe(false); // status_changed wins, 13 days < 45
	});

	it('falls back to completed when status_changed is null', () => {
		expect(archiveEligible(
			{ is_complete: true, status_changed: null, completed: '2026-01-01' },
			45,
			'2026-05-14',
		)).toBe(true); // completed is 133 days ago
	});

	it('returns false when both dates are null', () => {
		expect(archiveEligible(
			{ is_complete: true, status_changed: null, completed: null },
			45,
			'2026-05-14',
		)).toBe(false);
	});
});
