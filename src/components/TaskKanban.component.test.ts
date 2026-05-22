// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { writable, type Writable } from 'svelte/store';
import TaskKanban from './TaskKanban.svelte';
import type { Task } from '../types';
import type { TaskGroup } from '../query/types';
import type { KanbanCardField } from './kanbanCardFields';

function buildTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'test-task',
		path: 'Planner/Tasks/abc123-test-task.md',
		name: 'Test Task',
		type: 'task',
		status: 'Active',
		priority: 'None',
		area: 'Work',
		labels: ['feature'],
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

function renderKanban(options: {
	kanbanCardFields?: KanbanCardField[];
	collapsedColumns?: string[];
	task?: Task;
} = {}) {
	const task = options.task ?? buildTask();
	const groups = writable<TaskGroup[]>([
		{ key: 'Active', tasks: [task] },
	]);
	const activeTaskPath: Writable<string | null> = writable(null);
	const onOpen = vi.fn();
	const onContextMenu = vi.fn();
	const saveSettings = vi.fn(async () => {});
	const update = vi.fn();
	const plugin = {
		settings: {
			kanbanCollapsedColumns: options.collapsedColumns ?? [],
		},
		saveSettings,
		triggerTaskHoverPreview: vi.fn(),
	} as any;

	render(TaskKanban, {
		props: {
			plugin,
			groups,
			statuses: ['Active', 'Blocked'],
			statusColors: {},
			areaColors: {},
			labelColors: {},
			blockStatus: 'Blocked',
			kanbanCardFields: options.kanbanCardFields ?? ['area', 'dueDate', 'labels', 'depCount'],
			activeTaskPath,
			store: { update } as any,
			onOpen,
			onContextMenu,
		},
	});

	return { onOpen, onContextMenu, saveSettings, update };
}

describe('TaskKanban.svelte', () => {
	it('renders task name in card', () => {
		renderKanban();
		expect(screen.getByText('Test Task')).toBeInTheDocument();
	});

	it('shows area badge when area field is enabled', () => {
		renderKanban({ kanbanCardFields: ['area'] });
		expect(screen.getByText('Work')).toBeInTheDocument();
	});

	it('hides area badge when area field is disabled', () => {
		renderKanban({ kanbanCardFields: ['labels'] });
		expect(screen.queryByText('Work')).toBeNull();
	});

	it('shows label badges when labels field is enabled', () => {
		renderKanban({ kanbanCardFields: ['labels'] });
		expect(screen.getByText('feature')).toBeInTheDocument();
	});

	it('hides label badges when labels field is disabled', () => {
		renderKanban({ kanbanCardFields: ['area'] });
		expect(screen.queryByText('feature')).toBeNull();
	});

	it('shows dependency count badge when depCount is enabled and task has dependencies', () => {
		renderKanban({
			kanbanCardFields: ['depCount'],
			task: buildTask({ depends_on: ['Tasks/x.md'], blocks: ['Tasks/y.md'] }),
		});
		expect(screen.getByTitle('Blocked by 1 · Unblocks 1')).toBeInTheDocument();
	});

	it('hides card body when column starts collapsed', () => {
		renderKanban({ collapsedColumns: ['Active'] });
		expect(screen.queryByText('Test Task')).toBeNull();
		expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
	});

	it('calls saveSettings when toggling collapse', async () => {
		const { saveSettings } = renderKanban({ collapsedColumns: [] });
		await fireEvent.click(screen.getAllByRole('button', { name: 'Collapse' })[0]);
		expect(saveSettings).toHaveBeenCalledTimes(1);
	});

	it('calls onOpen when card is clicked', async () => {
		const { onOpen } = renderKanban();
		await fireEvent.click(screen.getByRole('button', { name: /test task/i }));
		expect(onOpen).toHaveBeenCalledWith('Planner/Tasks/abc123-test-task.md');
	});

	it('calls store.update when status select changes', async () => {
		const { update } = renderKanban();
		await fireEvent.change(screen.getByDisplayValue('Active'), { target: { value: 'Blocked' } });
		expect(update).toHaveBeenCalledWith('Planner/Tasks/abc123-test-task.md', { status: 'Blocked' });
	});
});
