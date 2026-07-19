import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
	EMPTY_EXPORT_CRITERIA,
	type ExportFilterCriteria,
	collectProjectFacets,
	filterTasksForExport,
	isUnfilteredCriteria,
	linkTargetPath,
} from './taskExportFilter';

function task(overrides: Partial<Task> = {}): Task {
	return {
		id: 'aaa111',
		slug: 't',
		path: 'Tasks/aaa111-t.md',
		name: 'Task',
		type: 'task',
		status: 'Active',
		priority: 'None',
		area: 'Work',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		workweek_only: false,
		holiday_dates: [],
		created: '2026-07-19',
		completed: null,
		status_changed: '2026-07-19',
		recurrence: null,
		recurrence_type: null,
		notes: '',
		reminder_override: null,
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

function crit(overrides: Partial<ExportFilterCriteria> = {}): ExportFilterCriteria {
	return { ...EMPTY_EXPORT_CRITERIA, ...overrides };
}

describe('linkTargetPath', () => {
	it('pulls the path out of an aliased wiki-link and strips .md', () => {
		expect(linkTargetPath('[[Tasks/proj-1|Website]]')).toBe('Tasks/proj-1');
		expect(linkTargetPath('[[Tasks/proj-1.md|Website]]')).toBe('Tasks/proj-1');
		expect(linkTargetPath('[[Tasks/proj-1]]')).toBe('Tasks/proj-1');
		expect(linkTargetPath(null)).toBeNull();
	});
});

describe('filterTasksForExport', () => {
	const tasks = [
		task({ name: 'A', area: 'Work', status: 'Active', labels: ['feature'] }),
		task({ name: 'B', area: 'Home', status: 'Done', labels: ['bug'], is_complete: true }),
		task({ name: 'C', area: 'Work', status: 'Blocked', labels: ['bug', 'feature'] }),
	];

	it('returns everything with empty criteria', () => {
		expect(filterTasksForExport(tasks, crit()).map((t) => t.name)).toEqual(['A', 'B', 'C']);
	});

	it('filters by area', () => {
		expect(filterTasksForExport(tasks, crit({ areas: ['Work'] })).map((t) => t.name)).toEqual(['A', 'C']);
	});

	it('filters by status', () => {
		expect(filterTasksForExport(tasks, crit({ statuses: ['Blocked'] })).map((t) => t.name)).toEqual(['C']);
	});

	it('filters by any matching label', () => {
		expect(filterTasksForExport(tasks, crit({ labels: ['feature'] })).map((t) => t.name)).toEqual(['A', 'C']);
	});

	it('drops completed tasks when includeCompleted is false', () => {
		expect(filterTasksForExport(tasks, crit({ includeCompleted: false })).map((t) => t.name)).toEqual(['A', 'C']);
	});

	it('ANDs across dimensions', () => {
		expect(filterTasksForExport(tasks, crit({ areas: ['Work'], labels: ['bug'] })).map((t) => t.name)).toEqual(['C']);
	});

	it('filters by project (parent link or the project note itself)', () => {
		const project = task({ name: 'Website', type: 'project', path: 'Tasks/proj-1.md', area: 'Work' });
		const child = task({ name: 'Child', parent_task: '[[Tasks/proj-1|Website]]', area: 'Work' });
		const other = task({ name: 'Other', area: 'Work' });
		const result = filterTasksForExport([project, child, other], crit({ projects: ['Tasks/proj-1'] }));
		expect(result.map((t) => t.name)).toEqual(['Website', 'Child']);
	});
});

describe('collectProjectFacets', () => {
	it('lists projects name-sorted with stripped paths', () => {
		const facets = collectProjectFacets([
			task({ name: 'Zeta', type: 'project', path: 'Tasks/z.md' }),
			task({ name: 'Alpha', type: 'project', path: 'Tasks/a.md' }),
			task({ name: 'Regular task', type: 'task' }),
		]);
		expect(facets).toEqual([
			{ path: 'Tasks/a', name: 'Alpha' },
			{ path: 'Tasks/z', name: 'Zeta' },
		]);
	});
});

describe('isUnfilteredCriteria', () => {
	it('is true only for the empty-with-completed default', () => {
		expect(isUnfilteredCriteria(crit())).toBe(true);
		expect(isUnfilteredCriteria(crit({ areas: ['Work'] }))).toBe(false);
		expect(isUnfilteredCriteria(crit({ includeCompleted: false }))).toBe(false);
	});
});
