// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { get, writable, type Writable } from 'svelte/store';
import TaskDetail from './TaskDetail.svelte';
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
		recurrence: null,
		recurrence_type: null,
		notes: 'Task notes',
		reminder_override: null,
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

function renderDetail(options: {
	tasks?: Task[];
	activeTaskPath?: string | null;
	settings?: Record<string, unknown>;
} = {}) {
	const tasks = writable(options.tasks ?? [buildTask()]);
	const initialActiveTaskPath = Object.prototype.hasOwnProperty.call(options, 'activeTaskPath')
		? options.activeTaskPath ?? null
		: options.tasks?.[0]?.path ?? 'Planner/Tasks/abc123-test-task.md';
	const activeTaskPath: Writable<string | null> = writable(
		initialActiveTaskPath,
	);
	const plugin = {
		app: {},
		settings: {
			statuses: ['Active', 'Blocked', 'Done'],
			completionStatus: 'Done',
			areas: ['Work', 'Personal'],
			labelValues: ['feature', 'bug'],
			statusColors: { Active: '#3b82f6', Blocked: '#ef4444', Done: '#10b981' },
			areaColors: { Work: '#3b82f6', Personal: '#8b5cf6' },
			labelColors: { feature: '#3b82f6', bug: '#ef4444' },
			priorityColors: { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981', None: '#94a3b8' },
			quickActions: { blockStatus: 'Blocked' },
			...options.settings,
		},
		archiveService: {
			archiveTask: vi.fn(async () => {}),
		},
		triggerTaskHoverPreview: vi.fn(),
	} as any;
	const store = {
		update: vi.fn(async () => {}),
		setStatus: vi.fn(async () => {}),
		updateParentTask: vi.fn(async () => {}),
		completeAndRecur: vi.fn(async () => null),
		delete: vi.fn(async () => {}),
		addDependency: vi.fn(async () => {}),
		removeDependency: vi.fn(async () => {}),
		openFile: vi.fn(),
		updateNotes: vi.fn(async (_taskPath: string, notes: string) => notes),
		getByPath: vi.fn((path: string) => get(tasks).find((task) => task.path === path) ?? null),
	} as any;

	render(TaskDetail, {
		props: {
			plugin,
			tasks,
			activeTaskPath,
			store,
		},
	});

	return { tasks, activeTaskPath, plugin, store };
}

describe('TaskDetail.svelte', () => {
	it('renders empty state when no task is selected', () => {
		renderDetail({ tasks: [buildTask()], activeTaskPath: null });
		expect(screen.getByText('No task selected.')).toBeInTheDocument();
	});

	it('renders active task name and core field labels', () => {
		renderDetail();
		expect(screen.getByDisplayValue('Test Task')).toBeInTheDocument();
		expect(screen.getByText('Status')).toBeInTheDocument();
		expect(screen.getByText('Priority')).toBeInTheDocument();
		expect(screen.getByText('Area')).toBeInTheDocument();
		expect(screen.getByText('Notes')).toBeInTheDocument();
	});

	it('shows project field and relationships section for task records', () => {
		renderDetail({
			tasks: [
				buildTask({ parent_task: 'Planner/Tasks/proj123-parent.md', depends_on: ['Planner/Tasks/dep123.md'] }),
				buildTask({
					id: 'proj123',
					slug: 'parent',
					path: 'Planner/Tasks/proj123-parent.md',
					name: 'Parent Project',
					type: 'project',
					labels: [],
				}),
				buildTask({
					id: 'dep123',
					slug: 'dependency',
					path: 'Planner/Tasks/dep123.md',
					name: 'Dependency Task',
					depends_on: [],
					blocks: [],
				}),
			],
		});

		expect(screen.getByText('Project')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Open parent project' })).toBeInTheDocument();
		expect(screen.getByText('System Fit')).toBeInTheDocument();
	});

	it('hides project-only task relationships for project records', () => {
		renderDetail({
			tasks: [
				buildTask({
					id: 'proj123',
					slug: 'roadmap',
					path: 'Planner/Tasks/proj123-roadmap.md',
					name: 'Roadmap',
					type: 'project',
					labels: [],
				}),
			],
		});

		expect(screen.queryByText('Project')).toBeNull();
		expect(screen.queryByText('System Fit')).toBeNull();
		expect(screen.getByLabelText('Workweek Only')).toBeInTheDocument();
	});

	it('shows blocked reason field when the task is in the blocked status', () => {
		renderDetail({
			tasks: [buildTask({ status: 'Blocked', blocked_reason: 'Waiting on API access' })],
		});

		expect(screen.getByText('Blocked Reason')).toBeInTheDocument();
		expect(screen.getByDisplayValue('Waiting on API access')).toBeInTheDocument();
	});

	it('shows archive action for completed tasks', () => {
		renderDetail({
			tasks: [buildTask({ is_complete: true, completed: '2026-05-23' })],
		});

		expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: '✓ Mark Complete' })).toBeNull();
	});

	it('reacts when the active task changes', async () => {
		const taskA = buildTask({ name: 'Alpha Task', path: 'Planner/Tasks/alpha.md' });
		const taskB = buildTask({ name: 'Beta Task', path: 'Planner/Tasks/beta.md', status: 'Blocked', blocked_reason: 'Waiting' });
		const { activeTaskPath } = renderDetail({ tasks: [taskA, taskB], activeTaskPath: taskA.path });

		expect(screen.getByDisplayValue('Alpha Task')).toBeInTheDocument();

		activeTaskPath.set(taskB.path);

		expect(await screen.findByDisplayValue('Beta Task')).toBeInTheDocument();
		expect(screen.getByText('Blocked Reason')).toBeInTheDocument();
	});
});