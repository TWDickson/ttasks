import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { TTasksSettings } from '../settings/types';
import type { Task } from '../types';
import { deriveTaskDetailFieldProps } from './taskDetailFieldProps';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/abc123-task.md',
		type: 'task',
		name: 'Default task',
		area: 'engineering',
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
		created: '2026-04-01',
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

function makeSettings(overrides: Partial<TTasksSettings> = {}): TTasksSettings {
	return {
		...DEFAULT_SETTINGS,
		...overrides,
		statuses: overrides.statuses ?? [...DEFAULT_SETTINGS.statuses],
		statusColors: overrides.statusColors ?? { ...DEFAULT_SETTINGS.statusColors },
		areas: overrides.areas ?? [...DEFAULT_SETTINGS.areas],
		areaColors: overrides.areaColors ?? { ...DEFAULT_SETTINGS.areaColors },
		labelValues: overrides.labelValues ?? [...DEFAULT_SETTINGS.labelValues],
		labelColors: overrides.labelColors ?? { ...DEFAULT_SETTINGS.labelColors },
		quickActions: overrides.quickActions ?? { ...DEFAULT_SETTINGS.quickActions },
		reminders: overrides.reminders ?? { ...DEFAULT_SETTINGS.reminders },
		archive: overrides.archive ?? { ...DEFAULT_SETTINGS.archive },
		customViews: overrides.customViews ?? [...DEFAULT_SETTINGS.customViews],
		kanbanCardFields: overrides.kanbanCardFields ?? [...DEFAULT_SETTINGS.kanbanCardFields],
		kanbanCollapsedColumns: overrides.kanbanCollapsedColumns ?? [...DEFAULT_SETTINGS.kanbanCollapsedColumns],
	};
}

describe('deriveTaskDetailFieldProps', () => {
	it('returns null props when no task is selected', () => {
		const state = deriveTaskDetailFieldProps({
			task: null,
			allTasks: [],
			settings: makeSettings(),
			blockStatus: 'Blocked',
			values: {
				name: '',
				status: 'Active',
				priority: 'None',
				area: '',
				labels: [],
				parent_task_path: '',
				due_date: '',
				start_date: '',
				assigned_to: '',
				estimated_days: null,
				blocked_reason: '',
				recurrence: null,
				recurrence_type: null,
			},
		});

		expect(state.nameFieldProps).toBeNull();
		expect(state.statusFieldProps).toBeNull();
		expect(state.blockedReasonFieldProps).toBeNull();
	});

	it('derives header and inline props with expected task-specific options', () => {
		const project = makeTask({ id: 'p1', path: 'Tasks/p1-project.md', type: 'project', name: 'Project One' });
		const task = makeTask({ id: 't1', path: 'Tasks/t1-task.md', type: 'task', name: 'Task One' });
		const peerTask = makeTask({ id: 't2', path: 'Tasks/t2-task.md', type: 'task', name: 'Task Two' });

		const state = deriveTaskDetailFieldProps({
			task,
			allTasks: [project, task, peerTask],
			settings: makeSettings(),
			blockStatus: 'Blocked',
			values: {
				name: task.name,
				status: task.status,
				priority: task.priority,
				area: task.area ?? '',
				labels: task.labels,
				parent_task_path: 'Tasks/p1-project',
				due_date: task.due_date ?? '',
				start_date: task.start_date ?? '',
				assigned_to: task.assigned_to ?? '',
				estimated_days: task.estimated_days,
				blocked_reason: task.blocked_reason ?? '',
				recurrence: task.recurrence ?? null,
				recurrence_type: task.recurrence_type ?? null,
			},
		});

		expect(state.nameFieldProps?.definition.label).toBe('');
		expect(state.nameFieldProps?.definition.placeholder).toBe('Task name');
		expect(state.parentTaskFieldProps?.definition.label).toBe('');

		const parentOptions = state.parentTaskFieldProps?.options;
		expect(Array.isArray(parentOptions)).toBe(true);
		expect((parentOptions as Task[]).every((item) => item.type === 'project')).toBe(true);
	});
});
