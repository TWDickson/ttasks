// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import TaskDetailNotes from './TaskDetailNotes.svelte';
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
		area: null,
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
		workweek_only: false,
		holiday_dates: [],
		created: '2026-05-22',
		completed: null,
		status_changed: '2026-05-22',
		repeat: null,
		notes: 'Some **notes**',
		is_complete: false,
		is_inbox: true,
		...overrides,
	};
}

function renderNotes(task = buildTask()) {
	const renderMarkdown = vi.fn(async (markdown: string, el: HTMLElement) => {
		el.textContent = `rendered:${markdown}`;
	});
	const onSaveNotes = vi.fn(async (_path: string, notes: string) => notes);
	render(TaskDetailNotes, { props: { task, renderMarkdown, onSaveNotes } });
	return { renderMarkdown, onSaveNotes };
}

afterEach(() => { vi.useRealTimers(); });

describe('TaskDetailNotes.svelte', () => {
	it('renders the preview through renderMarkdown with the task as source path', async () => {
		const { renderMarkdown } = renderNotes();

		await waitFor(() => expect(screen.getByText('rendered:Some **notes**')).toBeTruthy());
		expect(renderMarkdown).toHaveBeenCalledWith('Some **notes**', expect.any(HTMLElement), 'Planner/Tasks/abc123-test-task.md', expect.anything());
	});

	it('saves edits through onSaveNotes after the debounce', async () => {
		vi.useFakeTimers();
		const { onSaveNotes } = renderNotes();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		const textarea = screen.getByPlaceholderText('Add notes…');
		await fireEvent.input(textarea, { target: { value: 'Rewritten' } });
		expect(onSaveNotes).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(600);
		expect(onSaveNotes).toHaveBeenCalledWith('Planner/Tasks/abc123-test-task.md', 'Rewritten');
	});
});
