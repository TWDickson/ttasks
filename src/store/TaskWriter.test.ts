import { writable, get } from 'svelte/store';
import { buildStatusPolicy } from '../settings/statusPolicy';
import { TFile } from 'obsidian';
import { fmKey, toStoredFrontmatter } from '../schema/taskPersistence';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildTaskFrontmatter, nextStartFor, TaskWriter } from './TaskWriter';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'test-task',
		path: 'Planner/Tasks/abc123-test-task.md',
		type: 'task',
		name: 'Test Task',
		area: null,
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
		workweek_only: false,
		holiday_dates: [],
		created: '2026-05-20',
		completed: null,
		notes: '',
		repeat: null,
		is_complete: false,
		is_inbox: true,
		status_changed: null,
		...overrides,
	};
}

const noName = (_: string) => 'Unknown';
const byPath = (map: Record<string, string>) => (p: string) => map[p] ?? p.split('/').pop() ?? p;

function parseYaml(fm: string): Record<string, string> {
	const lines = fm.replace(/^---\n/, '').replace(/\n---$/, '').split('\n');
	const result: Record<string, string> = {};
	for (const line of lines) {
		const idx = line.indexOf(': ');
		if (idx >= 0) result[line.slice(0, idx)] = line.slice(idx + 2);
	}
	return result;
}

function makeFile(path: string): TFile {
	const file = Object.create(TFile.prototype) as TFile & { path: string; name: string; extension: string; basename: string };
	file.path = path;
	file.name = path.split('/').pop() ?? 'task.md';
	file.extension = 'md';
	file.basename = file.name.replace(/\.md$/, '');
	return file;
}

function makeWriterForUpdateTest(initialFrontmatter: Record<string, unknown>, seedTask?: Partial<Task>) {
	// Fixtures are written in field names; store them under their real keys.
	const frontmatter = toStoredFrontmatter(initialFrontmatter);
	const file = makeFile('Planner/Tasks/abc123-test-task.md');
	const processFrontMatter = vi.fn(async (_file: TFile, cb: (fm: Record<string, unknown>) => void) => {
		cb(frontmatter);
	});

	const plugin = {
		settings: {
			statuses: ['Active', 'In Progress', 'Done'],
			completionStatus: 'Done',
		},
		// Mirrors TTasksPlugin.statusPolicy: resolved from this fake's settings.
		get statusPolicy() { return buildStatusPolicy(this.settings); },
		app: {
			vault: {
				getAbstractFileByPath: vi.fn((path: string) => (path === file.path ? file : null)),
			},
			fileManager: {
				processFrontMatter,
			},
		},
		log: vi.fn(),
		logError: vi.fn(),
	};

	const tasks = writable<Task[]>(
		seedTask ? [makeTask({ path: file.path, ...seedTask })] : [],
	);
	const writer = new TaskWriter(plugin as any, tasks, 'Planner/Tasks', () => undefined);
	return { writer, file, frontmatter, processFrontMatter, tasks };
}

describe('buildTaskFrontmatter', () => {
	it('wraps output in --- delimiters', () => {
		const fm = buildTaskFrontmatter(makeTask(), noName);
		expect(fm.startsWith('---\n')).toBe(true);
		expect(fm.endsWith('\n---')).toBe(true);
	});

	it('emits correct type and name', () => {
		const fm = buildTaskFrontmatter(makeTask({ type: 'task', name: 'My Task' }), noName);
		const parsed = parseYaml(fm);
		expect(parsed[fmKey('type')]).toBe('task');
		expect(parsed[fmKey('name')]).toBe('"My Task"');
	});

	it('escapes special characters in name', () => {
		const fm = buildTaskFrontmatter(makeTask({ name: 'Fix "bug" in path\\thing' }), noName);
		expect(fm).toContain('"Fix \\"bug\\" in path\\\\thing"');
	});

	it('omits area when null (sparse)', () => {
		const fm = buildTaskFrontmatter(makeTask({ area: null }), noName);
		expect(parseYaml(fm)).not.toHaveProperty(fmKey('area'));
	});

	it('sets area to quoted string when provided', () => {
		const fm = buildTaskFrontmatter(makeTask({ area: 'Work' }), noName);
		expect(parseYaml(fm)[fmKey('area')]).toBe('"Work"');
	});

	it('emits cssclasses: [ttask]', () => {
		const fm = buildTaskFrontmatter(makeTask(), noName);
		expect(parseYaml(fm)['cssclasses']).toBe('[ttask]');
	});

	it('renders parent_task as aliased wikilink using resolveName', () => {
		const resolve = byPath({ 'Planner/Tasks/proj-1': 'My Project' });
		const fm = buildTaskFrontmatter(makeTask({ parent_task: 'Planner/Tasks/proj-1.md' }), resolve);
		expect(parseYaml(fm)[fmKey('parent_task')]).toBe("'[[Planner/Tasks/proj-1|My Project]]'");
	});

	it('omits parent_task when null', () => {
		const fm = buildTaskFrontmatter(makeTask({ parent_task: null }), noName);
		expect(parseYaml(fm)).not.toHaveProperty(fmKey('parent_task'));
	});

	it('omits depends_on when empty', () => {
		const fm = buildTaskFrontmatter(makeTask({ depends_on: [] }), noName);
		expect(parseYaml(fm)).not.toHaveProperty(fmKey('depends_on'));
	});

	it('renders depends_on as multiline YAML list with aliased links', () => {
		const resolve = byPath({ 'Planner/Tasks/dep-1': 'Dep One' });
		const fm = buildTaskFrontmatter(
			makeTask({ depends_on: ['Planner/Tasks/dep-1.md'] }),
			resolve,
		);
		expect(fm).toContain(`${fmKey('depends_on')}:\n  - '[[Planner/Tasks/dep-1|Dep One]]'`);
	});

	it('omits labels when empty', () => {
		const fm = buildTaskFrontmatter(makeTask({ labels: [] }), noName);
		expect(parseYaml(fm)).not.toHaveProperty(fmKey('labels'));
	});

	it('renders labels as multiline YAML list', () => {
		const fm = buildTaskFrontmatter(makeTask({ labels: ['frontend', 'urgent'] }), noName);
		expect(fm).toContain(`${fmKey('labels')}:\n  - "frontend"\n  - "urgent"`);
	});

	it('renders start_date and due_date as single-quoted strings', () => {
		const fm = buildTaskFrontmatter(
			makeTask({ start_date: '2026-05-01', due_date: '2026-05-31' }),
			noName,
		);
		const parsed = parseYaml(fm);
		expect(parsed[fmKey('start_date')]).toBe("'2026-05-01'");
		expect(parsed[fmKey('due_date')]).toBe("'2026-05-31'");
	});

	it('omits null dates', () => {
		const fm = buildTaskFrontmatter(makeTask({ start_date: null, due_date: null }), noName);
		const parsed = parseYaml(fm);
		expect(parsed).not.toHaveProperty(fmKey('start_date'));
		expect(parsed).not.toHaveProperty(fmKey('due_date'));
	});

	it('renders estimated_days as a number', () => {
		const fm = buildTaskFrontmatter(makeTask({ estimated_days: 3 }), noName);
		expect(parseYaml(fm)[fmKey('estimated_days')]).toBe('3');
	});

	it('renders workweek_only correctly', () => {
		expect(parseYaml(buildTaskFrontmatter(makeTask({ workweek_only: true }), noName))[fmKey('workweek_only')]).toBe('true');
		expect(parseYaml(buildTaskFrontmatter(makeTask({ workweek_only: false }), noName))).not.toHaveProperty(fmKey('workweek_only'));
	});

	it('renders holiday_dates as YAML list', () => {
		const fm = buildTaskFrontmatter(
			makeTask({ holiday_dates: ['2026-12-25', '2026-01-01'] }),
			noName,
		);
		expect(fm).toContain("holiday_dates:\n  - '2026-12-25'\n  - '2026-01-01'");
	});

	it('filters out invalid holiday date strings', () => {
		const fm = buildTaskFrontmatter(
			makeTask({ holiday_dates: ['2026-12-25', 'not-a-date', ''] as string[] }),
			noName,
		);
		expect(fm).toContain("holiday_dates:\n  - '2026-12-25'");
		expect(fm).not.toContain('not-a-date');
	});

	it('uses created date for status_changed', () => {
		const fm = buildTaskFrontmatter(makeTask({ created: '2026-03-15' }), noName);
		expect(parseYaml(fm)[fmKey('status_changed')]).toBe("'2026-03-15'");
	});

	it('renders a repeat rule as its ttask_repeat_* keys', () => {
		const fm = buildTaskFrontmatter(makeTask({ repeat: { every: 2, unit: 'week', weekdays: ['mon', 'wed'], until: '2026-12-31' } }), noName);
		expect(fm).toContain('ttask_repeat_every: 2\nttask_repeat_unit: week\nttask_repeat_weekdays:\n  - mon\n  - wed');
		expect(fm).toContain("ttask_repeat_until: '2026-12-31'");
	});

	it('writes no repeat keys when the task does not repeat', () => {
		expect(buildTaskFrontmatter(makeTask(), noName)).not.toContain('repeat');
	});

	it('produces project type frontmatter', () => {
		const fm = buildTaskFrontmatter(makeTask({ type: 'project', name: 'My Project' }), noName);
		expect(fm).toContain(`${fmKey('type')}: project`);
	});

	it('keeps a pinned day-of-month rule exactly as given (RP-1)', () => {
		// The spawned instance is due Feb 28 but the schedule is still the 31st.
		const fm = buildTaskFrontmatter(makeTask({ repeat: { every: 1, unit: 'month', monthday: 31 }, due_date: '2026-02-28' }), noName);
		expect(fm).toContain('ttask_repeat_monthday: 31');
	});

	it('marks a project type', () => {
		const fm = buildTaskFrontmatter(makeTask({ type: 'project', name: 'My Project' }), noName);
		expect(parseYaml(fm)[fmKey('type')]).toBe('project');
	});
});

describe('TaskWriter.update status_changed transitions', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-25T12:00:00'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('updates status_changed when status transitions (regression)', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest({
			status: 'Active',
			status_changed: '2026-05-01',
		});

		await writer.update(file.path, { status: 'In Progress' });

		expect(frontmatter[fmKey('status')]).toBe('In Progress');
		expect(frontmatter[fmKey('status_changed')]).toBe('2026-05-25');
	});

	it('does not modify status_changed when status is unchanged', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest({
			status: 'Active',
			status_changed: '2026-05-01',
		});

		await writer.update(file.path, { status: 'Active' });

		expect(frontmatter[fmKey('status_changed')]).toBe('2026-05-01');
	});

	it('does not touch status_changed when status is omitted', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest({
			status: 'Active',
			status_changed: '2026-05-01',
			priority: 'None',
		});

		await writer.update(file.path, { priority: 'High' });

		expect(frontmatter[fmKey('priority')]).toBe('High');
		expect(frontmatter[fmKey('status_changed')]).toBe('2026-05-01');
	});

	it('treats empty previous status as a real transition edge case', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest({
			status: '',
			status_changed: '2026-05-01',
		});

		await writer.update(file.path, { status: 'Active' });

		expect(frontmatter[fmKey('status')]).toBe('Active');
		expect(frontmatter[fmKey('status_changed')]).toBe('2026-05-25');
	});
});

describe('TaskWriter.update re-pins a repeat rule to a rescheduled due date (RP-1)', () => {
	const MONTHLY_31 = { every: 1, unit: 'month', monthday: 31 } as const;
	const repeatKeys = (fm: Record<string, unknown>) =>
		Object.fromEntries(Object.entries(fm).filter(([k]) => k.startsWith('ttask_repeat_')));

	it('moves the pinned day with a manual reschedule', async () => {
		const { writer, file, frontmatter, tasks } = makeWriterForUpdateTest(
			{ status: 'Active', ttask_repeat_every: 1, ttask_repeat_unit: 'month', ttask_repeat_monthday: 31 },
			{ status: 'Active', repeat: { ...MONTHLY_31 } },
		);

		await writer.update(file.path, { due_date: '2026-06-15' });

		expect(repeatKeys(frontmatter)).toEqual({ ttask_repeat_every: 1, ttask_repeat_unit: 'month', ttask_repeat_monthday: 15 });
		expect(get(tasks).find((t) => t.path === file.path)?.repeat).toEqual({ every: 1, unit: 'month', monthday: 15 });
	});

	it('honours an explicit rule over the re-pin (the spawn hand-off)', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest(
			{ status: 'Active' },
			{ status: 'Active', repeat: { ...MONTHLY_31 } },
		);

		// completeAndRecur writes the clamped due date with the inherited rule —
		// re-pinning from Feb 28 would lose the 31st.
		await writer.update(file.path, { due_date: '2026-02-28', repeat: { ...MONTHLY_31 } });

		expect(frontmatter.ttask_repeat_monthday).toBe(31);
	});

	it('leaves the rule alone when the due date is cleared, and on unrelated updates', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest(
			{ status: 'Active', ttask_repeat_every: 1, ttask_repeat_unit: 'month', ttask_repeat_monthday: 31 },
			{ status: 'Active', repeat: { ...MONTHLY_31 } },
		);

		await writer.update(file.path, { due_date: null });
		await writer.update(file.path, { priority: 'High' });

		expect(frontmatter.ttask_repeat_monthday).toBe(31);
	});

	it('clearing the rule removes every repeat key', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest(
			{ status: 'Active', ttask_repeat_every: 1, ttask_repeat_unit: 'week', ttask_repeat_weekdays: ['mon'] },
			{ status: 'Active', repeat: { every: 1, unit: 'week', weekdays: ['mon'] } },
		);

		await writer.update(file.path, { repeat: null });

		expect(repeatKeys(frontmatter)).toEqual({});
	});
});

describe('TaskWriter.update optimistic in-memory patch', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-05-25T12:00:00'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('merges the write into the tasks store without waiting for a rescan', async () => {
		const { writer, file, tasks } = makeWriterForUpdateTest(
			{ status: 'Active', status_changed: '2026-05-01' },
			{ status: 'Active', priority: 'None' },
		);

		await writer.update(file.path, { priority: 'High' });

		const patched = get(tasks).find((t) => t.path === file.path);
		expect(patched?.priority).toBe('High');
	});

	it('flips is_complete and stamps completed when transitioning into the completion status', async () => {
		const { writer, file, tasks } = makeWriterForUpdateTest(
			{ status: 'Active', status_changed: '2026-05-01' },
			{ status: 'Active', is_complete: false, completed: null },
		);

		await writer.update(file.path, { status: 'Done' });

		const patched = get(tasks).find((t) => t.path === file.path);
		expect(patched?.status).toBe('Done');
		expect(patched?.is_complete).toBe(true);
		expect(patched?.completed).toBe('2026-05-25');
		expect(patched?.status_changed).toBe('2026-05-25');
	});

	it('clears is_complete and completed when transitioning out of the completion status', async () => {
		const { writer, file, tasks } = makeWriterForUpdateTest(
			{ status: 'Done', status_changed: '2026-05-01', completed: '2026-05-01' },
			{ status: 'Done', is_complete: true, completed: '2026-05-01' },
		);

		await writer.update(file.path, { status: 'Active' });

		const patched = get(tasks).find((t) => t.path === file.path);
		expect(patched?.status).toBe('Active');
		expect(patched?.is_complete).toBe(false);
		expect(patched?.completed).toBeNull();
	});

	it('recomputes is_inbox when the area changes', async () => {
		const { writer, file, tasks } = makeWriterForUpdateTest(
			{ status: 'Active', area: null },
			{ status: 'Active', area: null, is_inbox: true },
		);

		await writer.update(file.path, { area: 'Work' });

		const patched = get(tasks).find((t) => t.path === file.path);
		expect(patched?.area).toBe('Work');
		expect(patched?.is_inbox).toBe(false);
	});
});

describe('nextStartFor', () => {
	it('keeps the same lead time before the next due date', () => {
		expect(nextStartFor({ start_date: '2026-01-29', due_date: '2026-01-31' }, '2026-02-28', '2026-01-31')).toBe('2026-02-26');
	});
	it('moves a start with no due date by as much as the due date moved', () => {
		expect(nextStartFor({ start_date: '2026-03-01', due_date: null }, '2026-03-12', '2026-03-05')).toBe('2026-03-08');
	});
	it('is null without a start date', () => {
		expect(nextStartFor({ start_date: null, due_date: '2026-01-31' }, '2026-02-28', '2026-01-31')).toBeNull();
	});
});
