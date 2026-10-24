// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TaskDetailRelationships from './TaskDetailRelationships.svelte';
import type { Task } from '../types';

function buildTask(overrides: Partial<Task> & Pick<Task, 'id' | 'name'>): Task {
	return {
		slug: overrides.id,
		path: `Planner/Tasks/${overrides.id}.md`,
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
		created: '2026-10-01',
		completed: null,
		status_changed: null,
		repeat: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		...overrides,
	};
}

const DEP = buildTask({ id: 'bbb222', name: 'Upstream dep', blocks: ['Planner/Tasks/aaa111.md'] });
const NEXT = buildTask({ id: 'ccc333', name: 'Downstream next', depends_on: ['Planner/Tasks/aaa111.md'] });
const TASK = buildTask({
	id: 'aaa111',
	name: 'Middle task',
	depends_on: ['Planner/Tasks/bbb222.md', 'Planner/Tasks/fff999.md'],
	blocks: ['Planner/Tasks/ccc333.md'],
});

function renderRel() {
	const props = {
		task: TASK,
		tasks: [TASK, DEP, NEXT],
		onHoverPreview: vi.fn(),
		onAddDependency: vi.fn(async () => {}),
		onRemoveDependency: vi.fn(async () => {}),
		onOpenTask: vi.fn(),
	};
	render(TaskDetailRelationships, { props });
	return props;
}

describe('TaskDetailRelationships.svelte', () => {
	it('shows blockers and unblocked tasks by name, and a missing link as a warning chip', () => {
		renderRel();

		expect(screen.getAllByRole('button', { name: 'Upstream dep' }).length).toBeGreaterThan(0);
		expect(screen.getAllByRole('button', { name: 'Downstream next' }).length).toBeGreaterThan(0);
		const missing = screen.getAllByRole('button', { name: /Missing task/ })[0];
		expect(missing.classList.contains('tt-chip-warning')).toBe(true);
	});

	it('opens, previews and removes a blocker through its callbacks', async () => {
		const props = renderRel();
		const chip = screen.getAllByRole('button', { name: 'Upstream dep' }).find((el) => el.classList.contains('tt-chip-rel'))!;

		await fireEvent.mouseEnter(chip);
		expect(props.onHoverPreview).toHaveBeenCalledWith('Planner/Tasks/bbb222.md', expect.any(MouseEvent));

		await fireEvent.click(chip);
		expect(props.onOpenTask).toHaveBeenCalledWith('Planner/Tasks/bbb222.md');

		await fireEvent.click(screen.getAllByRole('button', { name: 'Remove blocker' })[0]);
		expect(props.onRemoveDependency).toHaveBeenCalledWith('Planner/Tasks/bbb222.md');
	});
});
