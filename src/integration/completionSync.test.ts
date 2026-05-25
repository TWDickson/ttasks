import { describe, expect, it, vi } from 'vitest';
import { buildUpdatedSourceLine, findTTasksLinkLine, syncCompletionToSource } from './completionSync';
import type { Task } from '../types';

describe('buildUpdatedSourceLine', () => {
	it('checks an unchecked checkbox when checked=true', () => {
		expect(buildUpdatedSourceLine('- [ ] [[Planner/Tasks/abc|Task]]', true)).toBe('- [x] [[Planner/Tasks/abc|Task]]');
	});

	it('unchecks a checked checkbox when checked=false', () => {
		expect(buildUpdatedSourceLine('- [x] [[Planner/Tasks/abc|Task]]', false)).toBe('- [ ] [[Planner/Tasks/abc|Task]]');
	});

	it('preserves indentation', () => {
		expect(buildUpdatedSourceLine('  - [ ] [[Planner/Tasks/abc|Task]]', true)).toBe('  - [x] [[Planner/Tasks/abc|Task]]');
	});

	it('returns line unchanged when no wiki-link exists', () => {
		expect(buildUpdatedSourceLine('- [ ] plain task', true)).toBe('- [ ] plain task');
	});
});

describe('findTTasksLinkLine', () => {
	it('returns line index for exact aliased wikilink path match', () => {
		expect(findTTasksLinkLine(['A', '- [ ] [[Planner/Tasks/abc|Task]]'], 'Planner/Tasks/abc.md')).toBe(1);
	});

	it('returns line index for exact non-aliased wikilink path match', () => {
		expect(findTTasksLinkLine(['A', '- [ ] [[Planner/Tasks/abc]]'], 'Planner/Tasks/abc.md')).toBe(1);
	});

	it('does not match prefix collisions', () => {
		expect(
			findTTasksLinkLine(
				['- [ ] [[Planner/Tasks/abc123-task-2|Wrong]]', '- [ ] [[Planner/Tasks/abc123-task|Right]]'],
				'Planner/Tasks/abc123-task.md',
			),
		).toBe(1);
	});

	it('normalizes path comparisons with and without .md', () => {
		expect(findTTasksLinkLine(['- [ ] [[Planner/Tasks/abc|Task]]'], 'Planner/Tasks/abc')).toBe(0);
		expect(findTTasksLinkLine(['- [ ] [[Planner/Tasks/abc.md|Task]]'], 'Planner/Tasks/abc.md')).toBe(0);
	});

	it('uses resolver fallback only when exact match fails', () => {
		const resolver = vi.fn((linkPath: string, targetPath: string) =>
			linkPath.replace(/%20/g, ' ') === targetPath,
		);

		expect(
			findTTasksLinkLine(['- [ ] [[Planner/Tasks/Task%20Name|Task]]'], 'Planner/Tasks/Task Name.md', resolver),
		).toBe(0);
		expect(resolver).toHaveBeenCalledTimes(1);
	});

	it('does not call resolver when exact match succeeds', () => {
		const resolver = vi.fn(() => true);

		expect(findTTasksLinkLine(['- [ ] [[Planner/Tasks/abc|Task]]'], 'Planner/Tasks/abc.md', resolver)).toBe(0);
		expect(resolver).not.toHaveBeenCalled();
	});

	it('returns -1 when link is missing', () => {
		expect(findTTasksLinkLine(['A', 'B'], 'Planner/Tasks/abc.md')).toBe(-1);
	});
});

describe('syncCompletionToSource', () => {
	function buildTask(overrides: Partial<Task> = {}): Task {
		return {
			id: 'abc123',
			slug: 'task',
			path: 'Planner/Tasks/abc123-task.md',
			type: 'task',
			name: 'Task',
			area: null,
			status: 'Completed',
			priority: 'None',
			labels: [],
			parent_task: null,
			depends_on: [],
			blocks: [],
			blocked_reason: '',
			assigned_to: '',
			source: '[[Daily/2026-05-25|2026-05-25]]',
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
			...overrides,
		};
	}

	it('no-ops when source is missing', async () => {
		const app = {
			vault: {
				getAbstractFileByPath: vi.fn(),
				read: vi.fn(),
				modify: vi.fn(),
			},
		} as any;

		await syncCompletionToSource(buildTask({ source: '' }), app, 'Completed');
		expect(app.vault.getAbstractFileByPath).not.toHaveBeenCalled();
	});

	it('writes checked marker for completion status', async () => {
		const file = { path: 'Daily/2026-05-25.md' };
		const app = {
			vault: {
				getAbstractFileByPath: vi.fn(() => file),
				read: vi.fn(async () => '- [ ] [[Planner/Tasks/abc123-task|Task]]'),
				modify: vi.fn(async () => {}),
			},
		} as any;

		await syncCompletionToSource(buildTask({ status: 'Completed' }), app, 'Completed');
		expect(app.vault.modify).toHaveBeenCalledWith(file, '- [x] [[Planner/Tasks/abc123-task|Task]]');
	});
});
