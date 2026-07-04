import { writable, get } from 'svelte/store';
import { TFile } from 'obsidian';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { buildTaskFrontmatter, TaskWriter } from './TaskWriter';
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
		recurrence: null,
		recurrence_type: null,
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
	const frontmatter = { ...initialFrontmatter };
	const file = makeFile('Planner/Tasks/abc123-test-task.md');
	const processFrontMatter = vi.fn(async (_file: TFile, cb: (fm: Record<string, unknown>) => void) => {
		cb(frontmatter);
	});

	const plugin = {
		settings: {
			statuses: ['Active', 'In Progress', 'Done'],
			completionStatus: 'Done',
		},
		app: {
			vault: {
				getAbstractFileByPath: vi.fn((path: string) => (path === file.path ? file : null)),
			},
			fileManager: {
				processFrontMatter,
			},
		},
		log: vi.fn(),
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
		expect(parsed['type']).toBe('task');
		expect(parsed['name']).toBe('"My Task"');
	});

	it('escapes special characters in name', () => {
		const fm = buildTaskFrontmatter(makeTask({ name: 'Fix "bug" in path\\thing' }), noName);
		expect(fm).toContain('"Fix \\"bug\\" in path\\\\thing"');
	});

	it('sets area to null when null', () => {
		const fm = buildTaskFrontmatter(makeTask({ area: null }), noName);
		expect(parseYaml(fm)['area']).toBe('null');
	});

	it('sets area to quoted string when provided', () => {
		const fm = buildTaskFrontmatter(makeTask({ area: 'Work' }), noName);
		expect(parseYaml(fm)['area']).toBe('"Work"');
	});

	it('emits cssclasses: [ttask]', () => {
		const fm = buildTaskFrontmatter(makeTask(), noName);
		expect(parseYaml(fm)['cssclasses']).toBe('[ttask]');
	});

	it('renders parent_task as aliased wikilink using resolveName', () => {
		const resolve = byPath({ 'Planner/Tasks/proj-1': 'My Project' });
		const fm = buildTaskFrontmatter(makeTask({ parent_task: 'Planner/Tasks/proj-1.md' }), resolve);
		expect(parseYaml(fm)['parent_task']).toBe("'[[Planner/Tasks/proj-1|My Project]]'");
	});

	it('renders parent_task as null when null', () => {
		const fm = buildTaskFrontmatter(makeTask({ parent_task: null }), noName);
		expect(parseYaml(fm)['parent_task']).toBe('null');
	});

	it('renders depends_on as empty array when empty', () => {
		const fm = buildTaskFrontmatter(makeTask({ depends_on: [] }), noName);
		expect(fm).toContain('depends_on: []');
	});

	it('renders depends_on as multiline YAML list with aliased links', () => {
		const resolve = byPath({ 'Planner/Tasks/dep-1': 'Dep One' });
		const fm = buildTaskFrontmatter(
			makeTask({ depends_on: ['Planner/Tasks/dep-1.md'] }),
			resolve,
		);
		expect(fm).toContain('depends_on:\n  - \'[[Planner/Tasks/dep-1|Dep One]]\'');
	});

	it('renders labels as empty array when empty', () => {
		const fm = buildTaskFrontmatter(makeTask({ labels: [] }), noName);
		expect(fm).toContain('labels: []');
	});

	it('renders labels as multiline YAML list', () => {
		const fm = buildTaskFrontmatter(makeTask({ labels: ['frontend', 'urgent'] }), noName);
		expect(fm).toContain('labels:\n  - "frontend"\n  - "urgent"');
	});

	it('renders start_date and due_date as single-quoted strings', () => {
		const fm = buildTaskFrontmatter(
			makeTask({ start_date: '2026-05-01', due_date: '2026-05-31' }),
			noName,
		);
		const parsed = parseYaml(fm);
		expect(parsed['start_date']).toBe("'2026-05-01'");
		expect(parsed['due_date']).toBe("'2026-05-31'");
	});

	it('renders null dates as null', () => {
		const fm = buildTaskFrontmatter(makeTask({ start_date: null, due_date: null }), noName);
		const parsed = parseYaml(fm);
		expect(parsed['start_date']).toBe('null');
		expect(parsed['due_date']).toBe('null');
	});

	it('renders estimated_days as a number', () => {
		const fm = buildTaskFrontmatter(makeTask({ estimated_days: 3 }), noName);
		expect(parseYaml(fm)['estimated_days']).toBe('3');
	});

	it('renders workweek_only correctly', () => {
		expect(parseYaml(buildTaskFrontmatter(makeTask({ workweek_only: true }), noName))['workweek_only']).toBe('true');
		expect(parseYaml(buildTaskFrontmatter(makeTask({ workweek_only: false }), noName))['workweek_only']).toBe('false');
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
		expect(parseYaml(fm)['status_changed']).toBe("'2026-03-15'");
	});

	it('renders recurrence and recurrence_type', () => {
		const fm = buildTaskFrontmatter(
			makeTask({ recurrence: '1w', recurrence_type: 'due' }),
			noName,
		);
		const parsed = parseYaml(fm);
		expect(parsed['recurrence']).toBe('"1w"');
		expect(parsed['recurrence_type']).toBe('"due"');
	});

	it('renders null recurrence fields as null', () => {
		const fm = buildTaskFrontmatter(makeTask(), noName);
		const parsed = parseYaml(fm);
		expect(parsed['recurrence']).toBe('null');
		expect(parsed['recurrence_type']).toBe('null');
	});

	it('produces project type frontmatter', () => {
		const fm = buildTaskFrontmatter(makeTask({ type: 'project', name: 'My Project' }), noName);
		expect(parseYaml(fm)['type']).toBe('project');
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

		expect(frontmatter.status).toBe('In Progress');
		expect(frontmatter.status_changed).toBe('2026-05-25');
	});

	it('does not modify status_changed when status is unchanged', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest({
			status: 'Active',
			status_changed: '2026-05-01',
		});

		await writer.update(file.path, { status: 'Active' });

		expect(frontmatter.status_changed).toBe('2026-05-01');
	});

	it('does not touch status_changed when status is omitted', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest({
			status: 'Active',
			status_changed: '2026-05-01',
			priority: 'None',
		});

		await writer.update(file.path, { priority: 'High' });

		expect(frontmatter.priority).toBe('High');
		expect(frontmatter.status_changed).toBe('2026-05-01');
	});

	it('treats empty previous status as a real transition edge case', async () => {
		const { writer, file, frontmatter } = makeWriterForUpdateTest({
			status: '',
			status_changed: '2026-05-01',
		});

		await writer.update(file.path, { status: 'Active' });

		expect(frontmatter.status).toBe('Active');
		expect(frontmatter.status_changed).toBe('2026-05-25');
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
