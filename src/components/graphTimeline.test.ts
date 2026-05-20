import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
	buildTimelineNonWorkingBands,
	buildTimelineTicks,
	collectProjectHolidayDates,
	diffDays,
	formatDateISO,
	intersectsViewport,
	normalizeTimelineRange,
	percentAtDate,
} from './graphTimeline';

function makeTask(overrides: Partial<Task> & Pick<Task, 'path' | 'name'>): Task {
	const { path, name, ...rest } = overrides;
	return {
		id: path.slice(0, 6),
		slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		path,
		type: 'task',
		name,
		area: null,
		status: 'Active',
		priority: 'None',
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
		created: '2026-04-02',
		completed: null,
		notes: '',
		recurrence: null,
		recurrence_type: null,
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...rest,
	};
}

describe('graphTimeline', () => {
	it('diffDays returns whole-day delta', () => {
		expect(diffDays(new Date('2026-05-01'), new Date('2026-05-03'))).toBe(2);
	});

	it('formatDateISO returns YYYY-MM-DD', () => {
		expect(formatDateISO(new Date('2026-05-19T12:30:45Z'))).toBe('2026-05-19');
	});

	it('percentAtDate clamps to [0,100]', () => {
		const start = new Date('2026-05-01');
		const end = new Date('2026-05-11');
		expect(percentAtDate(new Date('2026-04-20'), start, end)).toBe(0);
		expect(percentAtDate(new Date('2026-05-20'), start, end)).toBe(100);
	});

	it('intersectsViewport detects overlap correctly', () => {
		expect(intersectsViewport(20, 10, 0, 25)).toBe(true);
		expect(intersectsViewport(40, 10, 0, 25)).toBe(false);
	});

	it('buildTimelineTicks includes end tick at 100%', () => {
		const ticks = buildTimelineTicks(new Date('2026-05-01T00:00:00'), new Date('2026-05-10T00:00:00'));
		expect(ticks.length).toBeGreaterThan(0);
		expect(ticks[ticks.length - 1].leftPercent).toBe(100);
		expect(ticks[ticks.length - 1].label).toBe('May 10');
		expect(ticks[0].position).toBe('start');
		expect(ticks[ticks.length - 1].position).toBe('end');
	});

	it('normalizeTimelineRange ensures minimum past/future buffer around today', () => {
		const today = new Date('2026-05-20T00:00:00');
		const range = normalizeTimelineRange(new Date('2026-05-15T00:00:00'), new Date('2026-05-22T00:00:00'), today);
		expect(formatDateISO(range.start)).toBe('2026-05-06');
		expect(formatDateISO(range.end)).toBe('2026-06-17');
	});

	it('buildTimelineNonWorkingBands marks weekends and holidays', () => {
		const bands = buildTimelineNonWorkingBands(
			new Date('2026-05-01T00:00:00'),
			new Date('2026-05-05T00:00:00'),
			new Set(['2026-05-04']),
		);
		expect(bands.map((band) => [band.date, band.kind])).toEqual([
			['2026-05-02', 'weekend'],
			['2026-05-03', 'weekend'],
			['2026-05-04', 'holiday'],
		]);
	});

	it('collectProjectHolidayDates extracts valid dates from project tasks only', () => {
		const tasks: Task[] = [
			makeTask({ path: 'Tasks/proj.md', name: 'Project', type: 'project', holiday_dates: ['2026-05-20', 'invalid'] }),
			makeTask({ path: 'Tasks/a.md', name: 'Task A', holiday_dates: ['2026-05-21'] }),
		];
		const dates = collectProjectHolidayDates(tasks);
		expect([...dates]).toEqual(['2026-05-20']);
	});
});
