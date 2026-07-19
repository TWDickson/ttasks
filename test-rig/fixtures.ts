/* Fixture data + a live in-memory plugin/store mock for the visual test rig.
   The store actually mutates its writable, so drag-drop, status changes, and
   detail edits update the UI just like the real plugin. */

import { get, writable, type Writable } from 'svelte/store';
import type { Task, TaskPriority, TaskStatus } from '../src/types';
import { PomodoroService } from '../src/store/PomodoroService';
import { DEFAULT_POMODORO_CONFIG } from '../src/integration/pomodoro';

const COMPLETION_STATUS = 'Done';

function isoDaysFromToday(days: number): string {
	const d = new Date();
	d.setDate(d.getDate() + days);
	return d.toISOString().slice(0, 10);
}

let seq = 0;
export function makeTask(overrides: Partial<Task> & { name: string }): Task {
	seq += 1;
	const id = seq.toString(16).padStart(6, '0');
	const slug = overrides.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
	const status = (overrides.status ?? 'Active') as TaskStatus;
	return {
		id,
		slug,
		path: `Planner/Tasks/${id}-${slug}.md`,
		type: 'task',
		area: null,
		priority: 'None' as TaskPriority,
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
		created: isoDaysFromToday(-14),
		completed: null,
		status_changed: isoDaysFromToday(-3),
		recurrence: null,
		recurrence_type: null,
		notes: '',
		reminder_override: null,
		is_inbox: overrides.area == null,
		is_complete: status === COMPLETION_STATUS,
		...overrides,
		status,
	};
}

function stripMd(path: string): string {
	return path.replace(/\.md$/, '');
}

export function buildFixtureTasks(): Task[] {
	const project = makeTask({
		name: 'Website Redesign',
		type: 'project',
		area: 'Work',
		priority: 'High',
		start_date: isoDaysFromToday(-10),
		due_date: isoDaysFromToday(20),
		estimated_days: 30,
		notes: 'Q3 flagship project. `styles.css` overhaul plus new landing page.\n\nSecond paragraph with more detail.',
	});

	const wireframes = makeTask({
		name: 'Finish wireframes for landing page',
		area: 'Work',
		priority: 'High',
		labels: ['feature'],
		parent_task: stripMd(project.path),
		start_date: isoDaysFromToday(-6),
		due_date: isoDaysFromToday(-2), // overdue
		estimated_days: 4,
		status: 'In Progress',
		notes: 'Overdue on purpose — exercises the red badge + name treatment.',
	});

	const implement = makeTask({
		name: 'Implement responsive hero section with a deliberately long name that wraps',
		area: 'Work',
		priority: 'Medium',
		labels: ['feature'],
		parent_task: stripMd(project.path),
		depends_on: [stripMd(wireframes.path)],
		due_date: isoDaysFromToday(6),
		estimated_days: 3,
	});

	const review = makeTask({
		name: 'Design review with stakeholders',
		area: 'Work',
		priority: 'Low',
		labels: ['research'],
		parent_task: stripMd(project.path),
		depends_on: [stripMd(implement.path)],
		estimated_days: 1,
	});

	// P2 stress row: overdue + three labels + a child (chevron) to rag the meta strip
	const stress = makeTask({
		name: 'Stress row with three labels that pushes the meta strip',
		area: 'Work',
		priority: 'High',
		labels: ['feature', 'bug', 'research'],
		parent_task: stripMd(project.path),
		due_date: isoDaysFromToday(-3),
		status: 'In Progress',
	});

	const stressChild = makeTask({
		name: 'Subtask under the stress row',
		labels: ['bug'],
		parent_task: stripMd(stress.path),
	});

	// Second project — gives the graph a second swim lane so the GP4 lane tints
	// and the GP3 project filter have something to act on.
	const apiProject = makeTask({
		name: 'API Platform',
		type: 'project',
		area: 'Database',
		priority: 'Medium',
		start_date: isoDaysFromToday(-4),
		due_date: isoDaysFromToday(25),
		estimated_days: 20,
	});

	const blocked = makeTask({
		name: 'Migrate analytics dashboard',
		area: 'Database',
		priority: 'High',
		labels: ['bug'],
		status: 'Blocked',
		parent_task: stripMd(apiProject.path),
		blocked_reason: 'Waiting on prod DB credentials from IT',
		due_date: isoDaysFromToday(1),
	});

	const apiEndpoints = makeTask({
		name: 'Build export endpoints',
		area: 'Database',
		priority: 'Medium',
		labels: ['feature'],
		parent_task: stripMd(apiProject.path),
		// Cross-project dependency: also waits on the Website Redesign review, so
		// focusing one lane pulls the connected task in the other into focus and
		// soft-tints that lane (exercises the lane-focus spillover).
		depends_on: [stripMd(blocked.path), stripMd(review.path)],
		due_date: isoDaysFromToday(10),
		estimated_days: 4,
	});

	const today = makeTask({
		name: 'Water the plants',
		area: 'Home',
		due_date: isoDaysFromToday(0),
		recurrence: 'weekly',
		recurrence_type: 'fixed',
	});

	const inbox = makeTask({
		name: 'Read that article about design tokens',
		priority: 'Low',
	});

	const done = makeTask({
		name: 'Renew domain registration',
		area: 'Home',
		status: 'Done',
		completed: isoDaysFromToday(-1),
		due_date: isoDaysFromToday(-1),
	});

	const doneOld = makeTask({
		name: 'File taxes',
		area: 'Home',
		status: 'Done',
		completed: isoDaysFromToday(-40),
	});

	// Reverse-index blocks
	wireframes.blocks = [stripMd(implement.path)];
	implement.blocks = [stripMd(review.path)];
	review.blocks = [stripMd(apiEndpoints.path)];
	blocked.blocks = [stripMd(apiEndpoints.path)];

	return [project, wireframes, implement, review, stress, stressChild, apiProject, blocked, apiEndpoints, today, inbox, done, doneOld];
}

export interface RigPlugin {
	app: Record<string, unknown>;
	manifest: { id: string };
	settings: Record<string, unknown>;
	taskStore: Record<string, unknown> & { tasks: Writable<Task[]> };
	scanEngine: { tasks: Writable<Task[]> };
	archiveService: { archiveTask: (path: string) => Promise<void> };
	pomodoroService: PomodoroService;
	activeTaskPath: Writable<string | null>;
	focusedTaskPath: Writable<string | null>;
	activeViewMode: Writable<string | null>;
	saveSettings: () => Promise<void>;
	openPluginSettings: () => void;
	showTaskContextMenu: (task: Task, event: MouseEvent) => void;
	triggerTaskHoverPreview: (path: string, event: MouseEvent) => void;
	openCapturedTask: (task: Task) => Promise<void>;
}

export interface RigPluginOptions {
	tasks?: Task[];
	/** Real plugin settings (e.g. from the vault's data.json) — merged over rig defaults. */
	settings?: Record<string, unknown>;
}

export function buildRigPlugin(options: RigPluginOptions = {}): RigPlugin {
	const tasks = writable<Task[]>(options.tasks ?? buildFixtureTasks());
	const activeTaskPath = writable<string | null>(null);
	const focusedTaskPath = writable<string | null>(null);
	const activeViewMode = writable<string | null>(null);
	const completionStatus = (options.settings?.completionStatus as string) ?? COMPLETION_STATUS;

	const findByPath = (pathLike: string): Task | null => {
		const normalized = stripMd(pathLike);
		return get(tasks).find((t) => stripMd(t.path) === normalized) ?? null;
	};

	const patchTask = (pathLike: string, updates: Partial<Task>): void => {
		const normalized = stripMd(pathLike);
		tasks.update((all) => all.map((t) => {
			if (stripMd(t.path) !== normalized) return t;
			const next = { ...t, ...updates };
			next.is_complete = next.status === completionStatus;
			return next;
		}));
	};

	const taskStore = {
		tasks,
		getByPath: findByPath,
		openDetail: (path: string) => activeTaskPath.set(path),
		openFile: (path: string) => console.info('[rig] openFile', path),
		restore: async (path: string) => patchTask(path, { status: 'Active', completed: null }),
		update: async (path: string, updates: Partial<Task>) => patchTask(path, updates),
		updateNotes: async (path: string, notes: string) => { patchTask(path, { notes }); return notes; },
		delete: async (path: string) => tasks.update((all) => all.filter((t) => stripMd(t.path) !== stripMd(path))),
		updateParentTask: async (path: string, parent: string | null) => patchTask(path, { parent_task: parent }),
		completeAndRecur: async () => null,
		addDependency: async (path: string, dep: string) => {
			const task = findByPath(path);
			if (task) patchTask(path, { depends_on: [...task.depends_on, dep] });
		},
		removeDependency: async (path: string, dep: string) => {
			const task = findByPath(path);
			if (task) patchTask(path, { depends_on: task.depends_on.filter((d) => d !== dep) });
		},
		setStatus: (task: Task, status: string) => {
			patchTask(task.path, {
				status,
				completed: status === completionStatus ? new Date().toISOString().slice(0, 10) : null,
			});
		},
		create: async (input: { name?: string } & Partial<Task>) => {
			const created = makeTask({ name: input.name ?? 'Untitled', ...input });
			tasks.update((all) => [...all, created]);
			return { path: created.path, name: created.name };
		},
	};

	const defaultSettings: Record<string, unknown> = {
			taskFolder: 'Planner/Tasks',
			customViews: [
				{
					id: 'rig-smart',
					name: 'High Priority',
					source: 'custom',
					renderer: 'list',
					query: {
						filter: { logic: 'and', conditions: [{ field: 'priority', operator: 'is', value: 'High' }] },
						sort: [],
						group: { kind: 'none' },
					},
					presentation: { hierarchy: 'flat', graphMode: 'dependency' },
				},
			],
			statuses: ['Active', 'In Progress', 'Blocked', 'Done'],
			statusColors: { 'In Progress': '#2563eb', Blocked: '#dc2626', Done: '#16a34a' },
			areaColors: { Work: '#f59e0b', Home: '#10b981', Database: '#3b82f6' },
			labelColors: { bug: '#ef4444', feature: '#8b5cf6', research: '#06b6d4' },
			areas: ['Work', 'Home', 'Database'],
			labelValues: ['feature', 'bug', 'research'],
			completionStatus: COMPLETION_STATUS,
			logbookRendererMode: 'list',
			kanbanCardFields: ['area', 'dueDate', 'labels', 'depCount'],
			kanbanCollapsedColumns: '',
			showCompletedByViewId: {},
			quickActions: { blockStatus: 'Blocked' },
			fabPosition: 'right',
			holidays: [],
			areaWorkweek: {},
			graphDiagnosticsEnabled: false,
			overviewGraphShowCompleted: false,
			overviewGraphGrouping: 'none',
	};

	return {
		app: {},
		manifest: { id: 'ttasks' },
		// Real vault settings win over rig defaults; defaults backfill anything
		// data.json doesn't carry.
		settings: { ...defaultSettings, ...(options.settings ?? {}) },
		taskStore,
		scanEngine: { tasks: writable<Task[]>([]) },
		archiveService: {
			archiveTask: async (path: string) => {
				tasks.update((all) => all.filter((t) => stripMd(t.path) !== stripMd(path)));
			},
		},
		pomodoroService: new PomodoroService({
			getConfig: () => ({ ...DEFAULT_POMODORO_CONFIG, autoStartNext: true }),
			logFocus: (focus) => console.info('[rig] pomodoro log', focus),
			notify: (message: string) => console.info('[rig] pomodoro', message),
		}),
		activeTaskPath,
		focusedTaskPath,
		activeViewMode,
		saveSettings: async () => {},
		openPluginSettings: () => console.info('[rig] openPluginSettings'),
		showTaskContextMenu: (task: Task, event: MouseEvent) => {
			console.info('[rig] context menu', task.name, event.type);
		},
		triggerTaskHoverPreview: () => {},
		openCapturedTask: async (task: Task) => console.info('[rig] openCapturedTask', task.name),
	};
}
