/**
 * Demo-data authoring for the dependency-graph / timeline sandbox. Lives outside
 * TaskStore so the store class stays focused on task persistence; the store keeps
 * a thin `seedGraphTestData()` that delegates here with injected dependencies.
 */
import type { Task, TaskCreateInput } from '../types';
import type { TTasksSettings } from '../settings';
import { addDaysLocal, localDateString } from '../utils/dateUtils';
import { stripMdExt } from '../utils/pathUtils';

export interface GraphSandboxSeederDeps {
	create: (input: TaskCreateInput) => Promise<Task>;
	addDependency: (taskPath: string, depPathWithoutExt: string) => Promise<void>;
	syncBlocks: () => Promise<void>;
	load: () => Promise<void>;
	getAll: () => Task[];
	ensureFolder: () => Promise<void>;
	settings: Pick<TTasksSettings, 'statuses'>;
	notice: (message: string) => void;
}

export async function seedGraphTestData(deps: GraphSandboxSeederDeps): Promise<{ created: number; skipped: boolean }> {
	const existing = deps.getAll().filter((task) => task.name.startsWith('[GS]'));
	if (existing.length > 0) {
		deps.notice(`TTasks: graph sandbox already exists (${existing.length} tasks).`);
		return { created: 0, skipped: true };
	}

	await deps.ensureFolder();

	const statuses = deps.settings.statuses ?? ['Active'];
	const status = (preferred: string, fallbackIndex = 0): string => {
		if (statuses.includes(preferred)) return preferred;
		return statuses[fallbackIndex] ?? statuses[0] ?? 'Active';
	};

	const iso = (daysFromToday: number): string => {
		return addDaysLocal(localDateString(), daysFromToday);
	};

	const makeInput = (overrides: Partial<TaskCreateInput> & Pick<TaskCreateInput, 'name' | 'type'>): TaskCreateInput => ({
		type: overrides.type,
		name: overrides.name,
		area: overrides.area ?? 'graph-sandbox',
		status: overrides.status ?? status('Active'),
		priority: overrides.priority ?? 'Medium',
		labels: overrides.labels ?? [],
		parent_task: overrides.parent_task ?? null,
		depends_on: overrides.depends_on ?? [],
		blocked_reason: overrides.blocked_reason ?? '',
		assigned_to: overrides.assigned_to ?? 'team',
		source: overrides.source ?? 'GraphSandbox',
		start_date: overrides.start_date ?? null,
		due_date: overrides.due_date ?? null,
		due_time: overrides.due_time ?? null,
		estimated_days: overrides.estimated_days ?? null,
		created: overrides.created ?? iso(-2),
		completed: overrides.completed ?? null,
		notes: overrides.notes ?? '',
		recurrence: overrides.recurrence ?? null,
		recurrence_type: overrides.recurrence_type ?? null,
	});

	const created: Task[] = [];

	const platformProject = await deps.create(makeInput({
		type: 'project',
		name: '[GS] Platform Revamp',
		area: 'Product',
		status: status('In Progress', 1),
		priority: 'High',
		start_date: iso(-8),
		due_date: iso(20),
		notes: 'Parent project for dependency and timeline graph testing.',
	}));
	created.push(platformProject);

	const dataProject = await deps.create(makeInput({
		type: 'project',
		name: '[GS] Data Reliability Program',
		area: 'Data',
		status: status('Active', 1),
		priority: 'High',
		start_date: iso(-6),
		due_date: iso(24),
		notes: 'Parent project for migration and dependency testing.',
	}));
	created.push(dataProject);

	const platformParent = stripMdExt(platformProject.path);
	const dataParent = stripMdExt(dataProject.path);

	const apiContract = await deps.create(makeInput({
		type: 'task',
		name: '[GS] API Contract Baseline',
		area: 'Product',
		status: status('In Progress', 1),
		priority: 'High',
		labels: ['feature'],
		parent_task: platformParent,
		start_date: iso(-5),
		due_date: iso(2),
		estimated_days: 7,
	}));
	created.push(apiContract);

	const detailPanel = await deps.create(makeInput({
		type: 'task',
		name: '[GS] Detail Panel Integration',
		area: 'Product',
		status: status('Active', 1),
		priority: 'High',
		labels: ['feature'],
		parent_task: platformParent,
		depends_on: [stripMdExt(apiContract.path)],
		start_date: iso(1),
		due_date: iso(8),
		estimated_days: 5,
	}));
	created.push(detailPanel);

	const smokeTests = await deps.create(makeInput({
		type: 'task',
		name: '[GS] Integration Smoke Tests',
		area: 'QA',
		status: status('Future', 2),
		priority: 'Medium',
		labels: ['docs'],
		parent_task: platformParent,
		depends_on: [stripMdExt(detailPanel.path)],
		start_date: iso(8),
		due_date: iso(12),
		estimated_days: 3,
	}));
	created.push(smokeTests);

	const releaseReadiness = await deps.create(makeInput({
		type: 'task',
		name: '[GS] Release Readiness Review',
		area: 'Product',
		status: status('Future', 2),
		priority: 'Medium',
		labels: ['action'],
		parent_task: platformParent,
		depends_on: [stripMdExt(smokeTests.path)],
		start_date: iso(12),
		due_date: iso(16),
		estimated_days: 2,
	}));
	created.push(releaseReadiness);

	const etlHardening = await deps.create(makeInput({
		type: 'task',
		name: '[GS] ETL Pipeline Hardening',
		area: 'Data',
		status: status('In Progress', 1),
		priority: 'High',
		labels: ['feature'],
		parent_task: dataParent,
		start_date: iso(-4),
		due_date: iso(4),
		estimated_days: 6,
	}));
	created.push(etlHardening);

	const migrationDryRun = await deps.create(makeInput({
		type: 'task',
		name: '[GS] Migration Dry Run',
		area: 'Data',
		status: status('Blocked', 1),
		priority: 'High',
		labels: ['research'],
		parent_task: dataParent,
		depends_on: [stripMdExt(etlHardening.path)],
		blocked_reason: 'Waiting for ETL hardening sign-off.',
		start_date: iso(5),
		due_date: iso(10),
		estimated_days: 3,
	}));
	created.push(migrationDryRun);

	const backfillVerification = await deps.create(makeInput({
		type: 'task',
		name: '[GS] Backfill Verification',
		area: 'Data',
		status: status('Future', 2),
		priority: 'Medium',
		labels: ['action'],
		parent_task: dataParent,
		depends_on: [stripMdExt(migrationDryRun.path), stripMdExt(detailPanel.path)],
		start_date: iso(10),
		due_date: iso(18),
		estimated_days: 4,
	}));
	created.push(backfillVerification);

	const cycleA = await deps.create(makeInput({
		type: 'task',
		name: '[GS] Incident Follow-up A',
		area: 'Operations',
		status: status('Active', 1),
		priority: 'Low',
		labels: ['action'],
		parent_task: platformParent,
		start_date: iso(-1),
		due_date: iso(6),
		estimated_days: 2,
	}));
	created.push(cycleA);

	const cycleB = await deps.create(makeInput({
		type: 'task',
		name: '[GS] Incident Follow-up B',
		area: 'Operations',
		status: status('Active', 1),
		priority: 'Low',
		labels: ['action'],
		parent_task: platformParent,
		depends_on: [stripMdExt(cycleA.path)],
		start_date: iso(0),
		due_date: iso(7),
		estimated_days: 2,
	}));
	created.push(cycleB);

	// Close the loop: A depends on B while B already depends on A, producing a
	// deliberate 2-cycle for exercising cycle detection in the graph views.
	await deps.addDependency(cycleA.path, stripMdExt(cycleB.path));

	await deps.syncBlocks();
	await deps.load();

	deps.notice(`TTasks: seeded ${created.length} graph sandbox tasks.`);
	return { created: created.length, skipped: false };
}
