// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { writable, type Writable } from 'svelte/store';
import TaskAgenda from './TaskAgenda.svelte';
import type { Task } from '../types';
import type { TaskGroup } from '../query/types';

function buildTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'test-task',
		path: 'Planner/Tasks/abc123-test-task.md',
		name: 'Test Task',
		type: 'task',
		status: 'Active',
		priority: 'None',
		area: null,
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		due_date: null,
		due_time: null,
		start_date: null,
		estimated_days: null,
		assigned_to: '',
		blocked_reason: '',
		source: '',
		recurrence: null,
		recurrence_type: null,
		reminder_override: null,
		notes: '',
		created: '2026-05-22',
		completed: null,
		status_changed: '2026-05-22',
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

function renderAgenda(groupList: TaskGroup[]) {
	const groups = writable<TaskGroup[]>(groupList);
	const activeTaskPath: Writable<string | null> = writable(null);
	const plugin = { triggerTaskHoverPreview: vi.fn() } as any;
	render(TaskAgenda, {
		props: {
			plugin,
			groups,
			areaColors: {},
			labelColors: {},
			activeTaskPath,
			onOpen: vi.fn(),
		},
	});
}

describe('TaskAgenda.svelte', () => {
	it('renders a known bucket with its friendly label', () => {
		renderAgenda([{ key: 'today', tasks: [buildTask({ name: 'Due today' })] }]);
		expect(screen.getByText('Today')).toBeInTheDocument();
		expect(screen.getByText('Due today')).toBeInTheDocument();
	});

	it('renders an unrecognized bucket key with the raw key and still shows its tasks', () => {
		renderAgenda([{ key: 'someday', tasks: [buildTask({ name: 'Future task' })] }]);
		expect(screen.getByText('someday')).toBeInTheDocument();
		expect(screen.getByText('Future task')).toBeInTheDocument();
	});
});
