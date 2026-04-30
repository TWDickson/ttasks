import { describe, expect, it } from 'vitest';
import { formatHumanDate, getTaskDateBadge, isTaskOverdue } from './taskDateMeta';

const TODAY = '2026-04-30';

describe('formatHumanDate', () => {
	it('omits year when same as today', () => {
		expect(formatHumanDate('2026-04-25', TODAY)).toBe('Apr 25');
	});

	it('includes year when different from today', () => {
		expect(formatHumanDate('2025-12-01', TODAY)).toBe('Dec 1, 2025');
	});
});

describe('isTaskOverdue', () => {
	it('treats incomplete past-due tasks as overdue', () => {
		expect(isTaskOverdue({ due_date: '2026-04-20', completed: null, is_complete: false }, TODAY)).toBe(true);
	});

	it('never treats completed tasks as overdue', () => {
		expect(isTaskOverdue({ due_date: '2026-04-20', completed: '2026-04-25', is_complete: true }, TODAY)).toBe(false);
	});
});

describe('getTaskDateBadge', () => {
	it('returns a completed badge for completed tasks instead of overdue text', () => {
		const badge = getTaskDateBadge({ due_date: '2026-04-20', completed: '2026-04-25', is_complete: true }, TODAY);
		expect(badge).toEqual({
			kind: 'completed',
			label: 'Completed Apr 25',
			title: '2026-04-25',
			isOverdue: false,
		});
	});

	it('returns an overdue due-date badge for incomplete tasks', () => {
		const badge = getTaskDateBadge({ due_date: '2026-04-20', completed: null, is_complete: false }, TODAY);
		expect(badge).toEqual({
			kind: 'due',
			label: '10d overdue',
			title: '2026-04-20',
			isOverdue: true,
		});
	});

	it('returns null when a task has no dates', () => {
		expect(getTaskDateBadge({ due_date: null, completed: null, is_complete: false }, TODAY)).toBeNull();
	});
});
