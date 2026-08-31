import { describe, expect, it } from 'vitest';
import { buildStatusPolicy } from '../settings/statusPolicy';
import { TFile } from 'obsidian';
import { TaskStore } from './TaskStore';
import type { Task } from '../types';

/**
 * Obsidian lets a user set any frontmatter property's *type* (Text / List /
 * Number / Checkbox / Date) in the Properties UI, and then rewrites that field
 * across the vault into the chosen shape. A scalar field can therefore arrive as
 * a one-element list, and a list field as a bare scalar. These tests pin the
 * frontmatter → Task boundary against that retyping, since the failure mode is
 * silent data loss (labels vanish, a project reads as a task, a relationship
 * disappears) rather than an error.
 */

const CANONICAL_FRONTMATTER = {
	type: 'task',
	name: 'Ship the planner',
	area: 'Work',
	status: 'Active',
	priority: 'High',
	labels: ['feature', 'bug'],
	depends_on: ['[[Tasks/aaa111-blocker|Blocker]]'],
	blocks: [],
	estimated_days: 3,
	workweek_only: true,
	holiday_dates: ['2026-07-04'],
	pomodoro_count: 4,
	focused_minutes: 100,
	due_time: '09:30',
	recurrence: 'weekly',
	recurrence_type: 'fixed',
	reminder_override: 'urgent',
};

/**
 * Build a store whose metadata cache serves `frontmatter` for a single file, and
 * parse that file into a Task. Link resolution is stubbed to "unresolved", which
 * makes `resolveWikiLinkPath` fall through to the raw linkpath + `.md`.
 */
const FRONTMATTER_TEST_SETTINGS = {
	tasksFolder: 'Tasks',
	statuses: ['Active', 'In Progress', 'Done'],
	completionStatus: 'Done',
};

async function parseFrontmatter(frontmatter: Record<string, unknown>): Promise<Task | null> {
	const file = Object.assign(new TFile(), {
		path: 'Tasks/abc123-ship-the-planner.md',
		basename: 'abc123-ship-the-planner',
		name: 'abc123-ship-the-planner.md',
	});

	const plugin = {
		app: {
			metadataCache: {
				getFileCache: () => ({ frontmatter, frontmatterPosition: { end: { offset: 0 } } }),
				getFirstLinkpathDest: () => null,
			},
			vault: { cachedRead: async () => '' },
		},
		settings: FRONTMATTER_TEST_SETTINGS,
		// Mirrors TTasksPlugin.statusPolicy: resolved from this fake's settings.
		statusPolicy: buildStatusPolicy(FRONTMATTER_TEST_SETTINGS),
		log: () => undefined,
		logError: () => undefined,
		register: () => undefined,
		registerEvent: () => undefined,
	} as never;

	const store = new TaskStore(plugin);
	// fileToTask is private; this is the only seam that exercises the real
	// frontmatter → Task mapping without booting a vault.
	return (store as unknown as {
		fileToTask(file: TFile): Promise<Task | null>;
	}).fileToTask(file);
}

describe('TaskStore frontmatter type handling — canonical shapes', () => {
	it('parses well-typed frontmatter into the expected Task', async () => {
		const task = await parseFrontmatter(CANONICAL_FRONTMATTER);
		expect(task).not.toBeNull();
		expect(task).toMatchObject({
			type: 'task',
			name: 'Ship the planner',
			area: 'Work',
			status: 'Active',
			priority: 'High',
			labels: ['feature', 'bug'],
			depends_on: ['Tasks/aaa111-blocker.md'],
			estimated_days: 3,
			workweek_only: true,
			holiday_dates: ['2026-07-04'],
			pomodoro_count: 4,
			focused_minutes: 100,
			due_time: '09:30',
			recurrence: 'weekly',
			reminder_override: 'urgent',
			is_inbox: false,
		});
	});
});

describe('TaskStore frontmatter type handling — list field retyped to Text', () => {
	it('keeps a single label written as a bare scalar', async () => {
		const task = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, labels: 'feature' });
		expect(task?.labels).toEqual(['feature']);
	});

	it('keeps a dependency written as a bare wikilink scalar', async () => {
		const task = await parseFrontmatter({
			...CANONICAL_FRONTMATTER,
			depends_on: '[[Tasks/aaa111-blocker|Blocker]]',
		});
		expect(task?.depends_on).toEqual(['Tasks/aaa111-blocker.md']);
	});

	it('keeps a holiday date written as a bare scalar', async () => {
		const task = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, holiday_dates: '2026-07-04' });
		expect(task?.holiday_dates).toEqual(['2026-07-04']);
	});
});

describe('TaskStore frontmatter type handling — scalar field retyped to List', () => {
	it('unwraps a List-typed name instead of skipping the file', async () => {
		const task = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, name: ['Ship the planner'] });
		expect(task?.name).toBe('Ship the planner');
	});

	it('unwraps a List-typed type so a project does not read as a task', async () => {
		const task = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, type: ['project'] });
		expect(task?.type).toBe('project');
	});

	it('unwraps a List-typed area so the task does not fall into the Inbox', async () => {
		const task = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, area: ['Work'] });
		expect(task?.area).toBe('Work');
		expect(task?.is_inbox).toBe(false);
	});

	it('unwraps a List-typed status instead of resetting it to the default', async () => {
		const task = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, status: ['In Progress'] });
		expect(task?.status).toBe('In Progress');
	});

	it('unwraps a List-typed priority', async () => {
		const task = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, priority: ['Low'] });
		expect(task?.priority).toBe('Low');
	});
});

describe('TaskStore frontmatter type handling — number and checkbox drift', () => {
	it('parses a quoted numeric estimated_days / pomodoro_count / focused_minutes', async () => {
		const task = await parseFrontmatter({
			...CANONICAL_FRONTMATTER,
			estimated_days: '3',
			pomodoro_count: '4',
			focused_minutes: '100',
		});
		expect(task?.estimated_days).toBe(3);
		expect(task?.pomodoro_count).toBe(4);
		expect(task?.focused_minutes).toBe(100);
	});

	it('parses a Text-typed workweek_only checkbox', async () => {
		const on = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, workweek_only: 'true' });
		const off = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, workweek_only: 'false' });
		expect(on?.workweek_only).toBe(true);
		expect(off?.workweek_only).toBe(false);
	});
});

describe('TaskStore frontmatter type handling — invalid values fall back', () => {
	it('falls back to the default priority and type for unknown values', async () => {
		const task = await parseFrontmatter({
			...CANONICAL_FRONTMATTER,
			priority: 'Urgent',
			type: 'epic',
		});
		expect(task?.priority).toBe('None');
		expect(task?.type).toBe('task');
	});

	it('tolerates a hand-edited lowercase priority / status', async () => {
		const task = await parseFrontmatter({
			...CANONICAL_FRONTMATTER,
			priority: 'high',
			status: 'in progress',
		});
		expect(task?.priority).toBe('High');
		expect(task?.status).toBe('In Progress');
	});

	it('drops an unrecognised reminder_override', async () => {
		const task = await parseFrontmatter({ ...CANONICAL_FRONTMATTER, reminder_override: 'loud' });
		expect(task?.reminder_override).toBeNull();
	});

	it('skips a note with no usable name', async () => {
		expect(await parseFrontmatter({ ...CANONICAL_FRONTMATTER, name: [] })).toBeNull();
		expect(await parseFrontmatter({ ...CANONICAL_FRONTMATTER, name: '' })).toBeNull();
	});
});
