import { describe, expect, it } from 'vitest';
import { App } from 'obsidian';
import { TaskJumpSuggestModal } from './TaskJumpSuggestModal';
import type { Task } from '../types';

function makeTask(id: string, name: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		slug: 'task',
		path: `Planner/Tasks/${id}-task.md`,
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
		created: null,
		completed: null,
		status_changed: null,
		notes: '',
		...overrides,
	} as Task;
}

function modalOver(tasks: Task[]): TaskJumpSuggestModal {
	return new TaskJumpSuggestModal(new App() as never, tasks, () => {});
}

const roof = makeTask('a1b2c3', 'Fix roof');
const gutter = makeTask('a1b2ff', 'Clear gutter');
const decoy = makeTask('999999', 'Mentions a1b2c3 in the name');

describe('TaskJumpSuggestModal hash search', () => {
	it('resolves a bare hash by exact prefix', () => {
		const result = modalOver([roof, gutter, decoy]).getSuggestions('a1b2ff');
		expect(result.map(m => m.item.name)).toEqual(['Clear gutter']);
	});

	it('ranks hash hits ahead of fuzzy name hits and does not duplicate them', () => {
		const result = modalOver([roof, gutter, decoy]).getSuggestions('a1b2c3');
		expect(result.map(m => m.item.name)).toEqual(['Fix roof', 'Mentions a1b2c3 in the name']);
	});

	it('returns every task sharing a prefix under the # sigil', () => {
		const result = modalOver([roof, gutter, decoy]).getSuggestions('#a1b2');
		expect(result.map(m => m.item.name)).toEqual(['Clear gutter', 'Fix roof']);
	});

	it('suppresses name matches under the # sigil', () => {
		const result = modalOver([decoy]).getSuggestions('#a1b2c3');
		expect(result).toEqual([]);
	});

	it('falls back to fuzzy matching for a non-hash query', () => {
		const result = modalOver([roof, gutter, decoy]).getSuggestions('gutter');
		expect(result.map(m => m.item.name)).toEqual(['Clear gutter']);
	});

	it('falls back to fuzzy matching when a hex-looking query matches no id', () => {
		const deadbeef = makeTask('111111', 'Task deadbe');
		const result = modalOver([roof, deadbeef]).getSuggestions('deadbe');
		expect(result.map(m => m.item.name)).toEqual(['Task deadbe']);
	});

	it('returns a well-formed FuzzyMatch for hash hits', () => {
		const [hit] = modalOver([roof]).getSuggestions('#a1b2c3');
		expect(hit.match).toEqual({ score: 0, matches: [] });
	});
});
