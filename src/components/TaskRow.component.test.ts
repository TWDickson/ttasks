// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TaskRow from './TaskRow.svelte';
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

function renderRow(props: Partial<{
	task: Task;
	selectable: boolean;
	selected: boolean;
	keyboardFocused: boolean;
	expandable: boolean;
	expanded: boolean;
	onSelect: (path: string) => void;
	onOpen: (path: string) => void;
	onExpand: () => void;
}> = {}) {
	const plugin = {
		triggerTaskHoverPreview: vi.fn(),
	} as any;
	const onOpen = props.onOpen ?? vi.fn();
	const onSelect = props.onSelect ?? vi.fn();
	const onExpand = props.onExpand ?? vi.fn();

	render(TaskRow, {
		props: {
			plugin,
			task: props.task ?? buildTask(),
			viewId: 'list',
			active: false,
			areaColors: {},
			labelColors: {},
			onOpen,
			onContextMenu: undefined,
			onRestore: undefined,
			indent: 0,
			expandable: props.expandable ?? false,
			expanded: props.expanded ?? true,
			onExpand,
			selectable: props.selectable ?? false,
			selected: props.selected ?? false,
			onSelect,
			keyboardFocused: props.keyboardFocused ?? false,
		},
	});

	return { onOpen, onSelect, onExpand };
}

describe('TaskRow.svelte', () => {
	it('renders task name', () => {
		renderRow({ task: buildTask({ name: 'Alpha Task' }) });
		expect(screen.getByText('Alpha Task')).toBeInTheDocument();
	});

	it('does not render checkbox when selectable is false', () => {
		renderRow({ selectable: false });
		expect(screen.queryByRole('checkbox', { name: 'Select task' })).toBeNull();
	});

	it('renders checkbox when selectable is true', () => {
		renderRow({ selectable: true });
		expect(screen.getByRole('checkbox', { name: 'Select task' })).toBeInTheDocument();
	});

	it('calls onSelect with task path when checkbox changes', async () => {
		const { onSelect } = renderRow({ selectable: true });
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Select task' }));
		expect(onSelect).toHaveBeenCalledWith('Planner/Tasks/abc123-test-task.md');
	});

	it('applies keyboard focused class when keyboardFocused is true', () => {
		renderRow({ keyboardFocused: true });
		const row = screen.getByRole('button', { name: /test task/i }).closest('li');
		expect(row?.classList.contains('is-keyboard-focused')).toBe(true);
	});

	it('renders expand button when expandable is true', () => {
		renderRow({ expandable: true, expanded: true });
		expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
	});

	it('does not render expand button when expandable is false', () => {
		renderRow({ expandable: false });
		expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull();
	});

	it('calls onExpand when expand button clicked', async () => {
		const { onExpand } = renderRow({ expandable: true, expanded: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
		expect(onExpand).toHaveBeenCalledTimes(1);
	});

	it('calls onOpen with task path when row button clicked', async () => {
		const { onOpen } = renderRow();
		await fireEvent.click(screen.getByRole('button', { name: /test task/i }));
		expect(onOpen).toHaveBeenCalledWith('Planner/Tasks/abc123-test-task.md');
	});
});
