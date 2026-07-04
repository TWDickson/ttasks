// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { readable, writable } from 'svelte/store';
import TaskRail from './TaskRail.svelte';
import type { RegisteredTaskViewDefinition } from '../views/viewRegistry';

function buildView(overrides: Partial<RegisteredTaskViewDefinition> = {}): RegisteredTaskViewDefinition {
	return {
		id: 'list',
		name: 'Active',
		icon: 'list',
		renderer: 'list',
		query: {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'none' },
		},
		presentation: { hierarchy: 'flat', graphMode: 'dependency' },
		source: 'builtin',
		...overrides,
	};
}

function buildProps(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		views: readable([
			buildView(),
			buildView({ id: 'kanban', name: 'Kanban', renderer: 'kanban' }),
			buildView({ id: 'custom-view-1', name: 'My List', source: 'custom' }),
		]),
		currentViewId: writable('list'),
		onSelectView: vi.fn(),
		onAddSmartList: vi.fn(),
		onSmartListContextMenu: vi.fn(),
		onNewTask: vi.fn(),
		onNewProject: vi.fn(),
		onOpenSettings: vi.fn(),
		...overrides,
	};
}

describe('TaskRail.svelte', () => {
	it('splits builtin views and Smart Lists into their own groups', () => {
		render(TaskRail, { props: buildProps() });

		expect(screen.getByText('Default Views')).toBeTruthy();
		expect(screen.getByText('Smart Lists')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Active' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Kanban' })).toBeTruthy();
		const smartItem = screen.getByRole('button', { name: 'My List' });
		expect(smartItem.classList.contains('tt-rail-item--smart')).toBe(true);
	});

	it('marks the current view active and reports selection through onSelectView', async () => {
		const props = buildProps();
		render(TaskRail, { props });

		expect(screen.getByRole('button', { name: 'Active' }).classList.contains('is-active')).toBe(true);

		await fireEvent.click(screen.getByRole('button', { name: 'Kanban' }));
		expect(props.onSelectView).toHaveBeenCalledWith('kanban');
	});

	it('shows the empty hint when no Smart Lists exist', () => {
		render(TaskRail, { props: buildProps({ views: readable([buildView()]) }) });

		expect(screen.getByText('No smart lists yet')).toBeTruthy();
	});

	it('routes Smart List context menus with the view id', async () => {
		const props = buildProps();
		render(TaskRail, { props });

		await fireEvent.contextMenu(screen.getByRole('button', { name: 'My List' }));
		expect(props.onSmartListContextMenu).toHaveBeenCalledWith('custom-view-1', expect.any(MouseEvent));
	});

	it('wires the action buttons to their callbacks', async () => {
		const props = buildProps();
		render(TaskRail, { props });

		await fireEvent.click(screen.getByRole('button', { name: 'Add smart list' }));
		await fireEvent.click(screen.getByRole('button', { name: 'New task' }));
		await fireEvent.click(screen.getByRole('button', { name: 'New project' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

		expect(props.onAddSmartList).toHaveBeenCalledTimes(1);
		expect(props.onNewTask).toHaveBeenCalledTimes(1);
		expect(props.onNewProject).toHaveBeenCalledTimes(1);
		expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
	});
});
