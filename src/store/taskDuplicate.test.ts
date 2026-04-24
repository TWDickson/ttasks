import { describe, expect, it } from 'vitest';
import { buildDuplicateInput } from './taskDuplicate';
import type { Task } from '../types';

// ── Fixture ──────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'write-tests',
		path: 'Planner/Tasks/abc123-write-tests.md',
		type: 'task',
		name: 'Write tests',
		area: 'engineering',
		status: 'In Progress',
		priority: 'High',
		labels: ['feature'],
		parent_task: 'Planner/Tasks/proj123-my-project',
		depends_on: ['Planner/Tasks/def456-prior-task'],
		blocks: ['Planner/Tasks/ghi789-next-task'],
		blocked_reason: 'Waiting on design',
		assigned_to: 'taylor',
		source: 'manual',
		start_date: '2026-04-10',
		due_date: '2026-04-30',
		due_time: null,
		estimated_days: 3,
		created: '2026-04-01',
		completed: null,
		notes: '## Notes\nSome context here.',
		recurrence: 'weekly',
		recurrence_type: 'fixed',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

const TODAY = '2026-04-16';
const FIRST_STATUS = 'Active';

// ── buildDuplicateInput ──────────────────────────────────────────────────────

describe('buildDuplicateInput', () => {
	describe('reset fields — should not carry over to the duplicate', () => {
		it('resets status to firstStatus', () => {
			const result = buildDuplicateInput(makeTask({ status: 'In Progress' }), TODAY, FIRST_STATUS);
			expect(result.status).toBe(FIRST_STATUS);
		});

		it('clears completed', () => {
			const result = buildDuplicateInput(makeTask({ completed: '2026-04-15' }), TODAY, FIRST_STATUS);
			expect(result.completed).toBeNull();
		});

		it('sets created to today', () => {
			const result = buildDuplicateInput(makeTask(), TODAY, FIRST_STATUS);
			expect(result.created).toBe(TODAY);
		});

		it('clears start_date', () => {
			const result = buildDuplicateInput(makeTask({ start_date: '2026-04-10' }), TODAY, FIRST_STATUS);
			expect(result.start_date).toBeNull();
		});

		it('clears depends_on (fresh instance — no stale prerequisite chain)', () => {
			const result = buildDuplicateInput(makeTask(), TODAY, FIRST_STATUS);
			expect(result.depends_on).toEqual([]);
		});

		it('clears blocked_reason', () => {
			const result = buildDuplicateInput(makeTask({ blocked_reason: 'Waiting on design' }), TODAY, FIRST_STATUS);
			expect(result.blocked_reason).toBe('');
		});
	});

	describe('preserved fields — should carry over unchanged', () => {
		it('preserves name', () => {
			const result = buildDuplicateInput(makeTask({ name: 'My important task' }), TODAY, FIRST_STATUS);
			expect(result.name).toBe('My important task');
		});

		it('preserves type', () => {
			const result = buildDuplicateInput(makeTask({ type: 'project' }), TODAY, FIRST_STATUS);
			expect(result.type).toBe('project');
		});

		it('preserves area', () => {
			const result = buildDuplicateInput(makeTask({ area: 'engineering' }), TODAY, FIRST_STATUS);
			expect(result.area).toBe('engineering');
		});

		it('preserves priority', () => {
			const result = buildDuplicateInput(makeTask({ priority: 'High' }), TODAY, FIRST_STATUS);
			expect(result.priority).toBe('High');
		});

		it('preserves labels', () => {
			const result = buildDuplicateInput(makeTask({ labels: ['bug', 'urgent'] }), TODAY, FIRST_STATUS);
			expect(result.labels).toEqual(['bug', 'urgent']);
		});

		it('preserves parent_task', () => {
			const result = buildDuplicateInput(makeTask(), TODAY, FIRST_STATUS);
			expect(result.parent_task).toBe('Planner/Tasks/proj123-my-project');
		});

		it('preserves due_date', () => {
			const result = buildDuplicateInput(makeTask({ due_date: '2026-04-30' }), TODAY, FIRST_STATUS);
			expect(result.due_date).toBe('2026-04-30');
		});

		it('preserves estimated_days', () => {
			const result = buildDuplicateInput(makeTask({ estimated_days: 3 }), TODAY, FIRST_STATUS);
			expect(result.estimated_days).toBe(3);
		});

		it('preserves notes', () => {
			const result = buildDuplicateInput(makeTask({ notes: '## Notes\nSome context here.' }), TODAY, FIRST_STATUS);
			expect(result.notes).toBe('## Notes\nSome context here.');
		});

		it('preserves recurrence', () => {
			const result = buildDuplicateInput(makeTask({ recurrence: 'weekly' }), TODAY, FIRST_STATUS);
			expect(result.recurrence).toBe('weekly');
		});

		it('preserves recurrence_type', () => {
			const result = buildDuplicateInput(makeTask({ recurrence_type: 'fixed' }), TODAY, FIRST_STATUS);
			expect(result.recurrence_type).toBe('fixed');
		});

		it('preserves assigned_to', () => {
			const result = buildDuplicateInput(makeTask({ assigned_to: 'taylor' }), TODAY, FIRST_STATUS);
			expect(result.assigned_to).toBe('taylor');
		});

		it('preserves source', () => {
			const result = buildDuplicateInput(makeTask({ source: 'manual' }), TODAY, FIRST_STATUS);
			expect(result.source).toBe('manual');
		});
	});

	describe('null-safe inputs', () => {
		it('handles null area without throwing', () => {
			const result = buildDuplicateInput(makeTask({ area: null }), TODAY, FIRST_STATUS);
			expect(result.area).toBeNull();
		});

		it('handles empty labels without throwing', () => {
			const result = buildDuplicateInput(makeTask({ labels: [] }), TODAY, FIRST_STATUS);
			expect(result.labels).toEqual([]);
		});

		it('handles null due_date', () => {
			const result = buildDuplicateInput(makeTask({ due_date: null }), TODAY, FIRST_STATUS);
			expect(result.due_date).toBeNull();
		});

		it('handles null estimated_days', () => {
			const result = buildDuplicateInput(makeTask({ estimated_days: null }), TODAY, FIRST_STATUS);
			expect(result.estimated_days).toBeNull();
		});

		it('handles null recurrence', () => {
			const result = buildDuplicateInput(makeTask({ recurrence: null, recurrence_type: null }), TODAY, FIRST_STATUS);
			expect(result.recurrence).toBeNull();
			expect(result.recurrence_type).toBeNull();
		});

		it('handles empty notes', () => {
			const result = buildDuplicateInput(makeTask({ notes: '' }), TODAY, FIRST_STATUS);
			expect(result.notes).toBe('');
		});
	});

	describe('result shape', () => {
		it('does not include id, slug, path, blocks, or derived flags (matches TaskCreateInput)', () => {
			const result = buildDuplicateInput(makeTask(), TODAY, FIRST_STATUS);
			expect(result).not.toHaveProperty('id');
			expect(result).not.toHaveProperty('slug');
			expect(result).not.toHaveProperty('path');
			expect(result).not.toHaveProperty('blocks');
			expect(result).not.toHaveProperty('is_complete');
			expect(result).not.toHaveProperty('is_inbox');
		});
	});
});
