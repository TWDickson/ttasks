import { describe, expect, it } from 'vitest';
import type { ExternalTask } from './types';
import { buildPromoteInput, buildPromotedLine } from './promoteTask';

function buildExternalTask(overrides: Partial<ExternalTask> = {}): ExternalTask {
	return {
		id: 'ext-1',
		slug: '1',
		path: 'Daily/2026-05-25.md#L3',
		type: 'task',
		name: 'Captured task',
		area: null,
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: 'Daily/2026-05-25.md',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: null,
		completed: null,
		status_changed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		external: true,
		source_type: 'captured-checkbox',
		location: { filePath: 'Daily/2026-05-25.md', line: 3 },
		fromPreviousDay: false,
		...overrides,
	};
}

describe('buildPromoteInput', () => {
	it('maps external task fields to task create input', () => {
		const external = buildExternalTask({
			priority: 'High',
			due_date: '2026-05-28',
			start_date: '2026-05-25',
			labels: ['feature'],
			area: 'Work',
		});

		const input = buildPromoteInput(external, 'Active', '2026-05-25');
		expect(input.priority).toBe('High');
		expect(input.due_date).toBe('2026-05-28');
		expect(input.start_date).toBe('2026-05-25');
		expect(input.labels).toEqual(['feature']);
		expect(input.area).toBe('Work');
	});

	it('falls back to inbox status when external status is empty', () => {
		const external = buildExternalTask({ status: '' as any });
		const input = buildPromoteInput(external, 'Active', 'ActiveSource');
		expect(input.status).toBe('Active');
	});

	it('stores source as a wiki-link to the originating note', () => {
		const input = buildPromoteInput(buildExternalTask(), 'Active', '2026-05-25');
		expect(input.source).toBe('[[Daily/2026-05-25|2026-05-25]]');
	});

	it('carries parsed scheduling fields', () => {
		const external = buildExternalTask({
			priority: 'Medium',
			due_date: '2026-05-29',
			start_date: '2026-05-27',
		});
		const input = buildPromoteInput(external, 'Active', '2026-05-25');
		expect(input.priority).toBe('Medium');
		expect(input.due_date).toBe('2026-05-29');
		expect(input.start_date).toBe('2026-05-27');
	});

	it('keeps filename-inferred start dates', () => {
		const input = buildPromoteInput(buildExternalTask({ start_date: '2026-05-25' }), 'Active', '2026-05-25');
		expect(input.start_date).toBe('2026-05-25');
	});
});

describe('buildPromotedLine', () => {
	it('replaces checkbox text with an unchecked task wiki-link', () => {
		expect(buildPromotedLine('- [ ] original text', 'Planner/Tasks/abc123-task.md', 'Task Name'))
			.toBe('- [ ] [[Planner/Tasks/abc123-task|Task Name]]');
	});

	it('preserves leading indentation', () => {
		expect(buildPromotedLine('  - [ ] indented', 'Planner/Tasks/abc123-task.md', 'Task Name'))
			.toBe('  - [ ] [[Planner/Tasks/abc123-task|Task Name]]');
	});

	it('keeps marker unchecked even if original line was checked', () => {
		expect(buildPromotedLine('- [x] done', 'Planner/Tasks/abc123-task.md', 'Task Name'))
			.toBe('- [ ] [[Planner/Tasks/abc123-task|Task Name]]');
	});

	it('handles trailing whitespace', () => {
		expect(buildPromotedLine('- [ ] task   ', 'Planner/Tasks/abc123-task.md', 'Task Name'))
			.toBe('- [ ] [[Planner/Tasks/abc123-task|Task Name]]   ');
	});

	it('returns original text when no checkbox marker is present', () => {
		expect(buildPromotedLine('plain paragraph', 'Planner/Tasks/abc123-task.md', 'Task Name'))
			.toBe('plain paragraph');
	});
});
