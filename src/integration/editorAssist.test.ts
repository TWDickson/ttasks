import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { filterTaskSuggestions } from './editorAssist';

function task(overrides: Partial<Task>): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/task.md',
		type: 'task',
		name: 'Task',
		category: null,
		status: 'Active',
		priority: 'None',
		task_type: null,
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		estimated_days: null,
		created: '2026-04-16',
		completed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

describe('filterTaskSuggestions', () => {
	it('prioritizes prefix name matches over substring matches', () => {
		const suggestions = filterTaskSuggestions('pla', [
			task({ name: 'Platform cleanup', path: 'Tasks/a.md' }),
			task({ name: 'Cleanup platform docs', path: 'Tasks/b.md' }),
		]);

		expect(suggestions[0]?.name).toBe('Platform cleanup');
	});

	it('returns all tasks sorted by name when query is empty', () => {
		const suggestions = filterTaskSuggestions('', [
			task({ name: 'Bravo', path: 'Tasks/b.md' }),
			task({ name: 'Alpha', path: 'Tasks/a.md' }),
		]);

		expect(suggestions.map(t => t.name)).toEqual(['Alpha', 'Bravo']);
	});
});
