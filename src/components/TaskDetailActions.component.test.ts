// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TaskDetailActions from './TaskDetailActions.svelte';
import type { Task } from '../types';

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

function renderActions(task: Task, withArchive = false) {
	const onMarkComplete = vi.fn(async () => {});
	const onOpenInEditor = vi.fn();
	const onDelete = vi.fn(async () => {});
	const onArchive = vi.fn(async () => {});

	render(TaskDetailActions, {
		props: {
			task,
			onMarkComplete,
			onOpenInEditor,
			onDelete,
			onArchive: withArchive ? onArchive : undefined,
		},
	});

	return { onMarkComplete, onOpenInEditor, onDelete, onArchive };
}

describe('TaskDetailActions.svelte', () => {
	it('shows mark complete button for incomplete task', () => {
		renderActions(buildTask({ is_complete: false }));
		expect(screen.getByRole('button', { name: 'Mark Complete' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
	});

	it('shows archive button for completed task when archive action is provided', () => {
		renderActions(buildTask({ is_complete: true, completed: '2026-05-22' }), true);
		expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Mark Complete' })).toBeNull();
	});

	it('calls onMarkComplete when mark complete clicked', async () => {
		const { onMarkComplete } = renderActions(buildTask({ is_complete: false }));
		await fireEvent.click(screen.getByRole('button', { name: 'Mark Complete' }));
		expect(onMarkComplete).toHaveBeenCalledTimes(1);
	});

	it('calls onOpenInEditor when open in editor clicked', async () => {
		const { onOpenInEditor } = renderActions(buildTask());
		await fireEvent.click(screen.getByRole('button', { name: 'Open in editor' }));
		expect(onOpenInEditor).toHaveBeenCalledTimes(1);
	});

	it('calls onDelete when delete clicked', async () => {
		const { onDelete } = renderActions(buildTask());
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(onDelete).toHaveBeenCalledTimes(1);
	});

	it('orders buttons as Open in editor, Mark Complete, Delete', () => {
		renderActions(buildTask({ is_complete: false }));
		const names = screen.getAllByRole('button').map((el) => el.textContent?.trim());
		expect(names).toEqual(['Open in editor', 'Mark Complete', 'Delete']);
	});

	it('renders created/completed metadata when present', () => {
		renderActions(buildTask({ created: '2026-05-01', completed: '2026-05-20', is_complete: true }), true);
		expect(screen.getByText('Created 2026-05-01')).toBeInTheDocument();
		expect(screen.getByText('Completed 2026-05-20')).toBeInTheDocument();
	});
});
