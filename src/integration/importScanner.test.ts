import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, normalizeCaptureSource } from '../settings';
import { collectAllCapturableTasks } from './importScanner';

interface MockFile {
	path: string;
}

function createApp(contentByPath: Record<string, string>) {
	const files: MockFile[] = Object.keys(contentByPath).map((path) => ({ path }));
	return {
		vault: {
			getMarkdownFiles: () => files,
			cachedRead: async (file: MockFile) => contentByPath[file.path] ?? '',
		},
	};
}

describe('collectAllCapturableTasks', () => {
	it('collects tasks from all configured capture sources', async () => {
		const app = createApp({
			'Daily/2026-05-25.md': '- [ ] daily',
			'Inbox/notes.md': '- [ ] inbox',
		});
		const settings = {
			...DEFAULT_SETTINGS,
			captureSources: [
				normalizeCaptureSource({ path: 'Daily' }),
				normalizeCaptureSource({ path: 'Inbox' }),
			],
		};

		const tasks = await collectAllCapturableTasks(app, settings);
		expect(tasks.map((task) => task.name).sort()).toEqual(['daily', 'inbox']);
	});

	it('respects includeSubdirectories=false', async () => {
		const app = createApp({
			'Daily/one.md': '- [ ] include',
			'Daily/Nested/two.md': '- [ ] exclude',
		});
		const settings = {
			...DEFAULT_SETTINGS,
			captureSources: [normalizeCaptureSource({ path: 'Daily', includeSubdirectories: false })],
		};

		const tasks = await collectAllCapturableTasks(app, settings);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].name).toBe('include');
	});

	it('excludes files inside tasksFolder', async () => {
		const app = createApp({
			'Planner/Tasks/native.md': '- [ ] should not scan',
			'Daily/one.md': '- [ ] should scan',
		});
		const settings = {
			...DEFAULT_SETTINGS,
			tasksFolder: 'Planner/Tasks',
			captureSources: [
				normalizeCaptureSource({ path: 'Planner/Tasks' }),
				normalizeCaptureSource({ path: 'Daily' }),
			],
		};

		const tasks = await collectAllCapturableTasks(app, settings);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].location.filePath).toBe('Daily/one.md');
	});

	it('excludes already promoted checkboxes', async () => {
		const app = createApp({
			'Daily/2026-05-25.md': '- [ ] [[Planner/Tasks/abc123-task|Task]]\n- [ ] keep',
		});
		const settings = {
			...DEFAULT_SETTINGS,
			tasksFolder: 'Planner/Tasks',
			captureSources: [normalizeCaptureSource({ path: 'Daily' })],
		};

		const tasks = await collectAllCapturableTasks(app, settings);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].name).toBe('keep');
	});

	it('returns empty array when captureSources is empty', async () => {
		const app = createApp({ 'Daily/one.md': '- [ ] task' });
		const settings = { ...DEFAULT_SETTINGS, captureSources: [] };

		const tasks = await collectAllCapturableTasks(app, settings);
		expect(tasks).toEqual([]);
	});

	it('does not include file outside configured source paths', async () => {
		const app = createApp({
			'Daily/one.md': '- [ ] include',
			'Projects/two.md': '- [ ] ignore',
		});
		const settings = {
			...DEFAULT_SETTINGS,
			captureSources: [normalizeCaptureSource({ path: 'Daily' })],
		};

		const tasks = await collectAllCapturableTasks(app, settings);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].location.filePath).toBe('Daily/one.md');
	});

	it('continues scanning after a file read failure and reports detailed error context', async () => {
		const app = {
			vault: {
				getMarkdownFiles: () => ([{ path: 'Daily/one.md' }, { path: 'Daily/two.md' }]),
				cachedRead: vi.fn(async (file: { path: string }) => {
					if (file.path === 'Daily/one.md') {
						throw new Error('read failed');
					}
					return '- [ ] second';
				}),
			},
		};
		const settings = {
			...DEFAULT_SETTINGS,
			captureSources: [normalizeCaptureSource({ path: 'Daily' })],
		};
		const onFileError = vi.fn();

		const tasks = await collectAllCapturableTasks(app as any, settings, { onFileError });

		expect(tasks).toHaveLength(1);
		expect(tasks[0].name).toBe('second');
		expect(onFileError).toHaveBeenCalledTimes(1);
		expect(onFileError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				filePath: 'Daily/one.md',
				operation: 'import.scanFile',
			}),
		);
	});

	it('preserves deterministic file and line ordering under shuffled completion timing', async () => {
		vi.useFakeTimers();
		const files = [
			{ path: 'Daily/A.md' },
			{ path: 'Daily/B.md' },
			{ path: 'Daily/C.md' },
		];
		const contentByPath: Record<string, string> = {
			'Daily/A.md': '- [ ] A1\n- [ ] A2',
			'Daily/B.md': '- [ ] B1',
			'Daily/C.md': '- [ ] C1\n- [ ] C2',
		};
		const delayByPath: Record<string, number> = {
			'Daily/A.md': 40,
			'Daily/B.md': 5,
			'Daily/C.md': 20,
		};

		const app = {
			vault: {
				getMarkdownFiles: () => files,
				cachedRead: vi.fn((file: { path: string }) => new Promise<string>((resolve) => {
					setTimeout(() => resolve(contentByPath[file.path]), delayByPath[file.path]);
				})),
			},
		};
		const settings = {
			...DEFAULT_SETTINGS,
			captureSources: [normalizeCaptureSource({ path: 'Daily' })],
		};

		const run = collectAllCapturableTasks(app as any, settings, { concurrency: 2 });
		await vi.runAllTimersAsync();
		const tasks = await run;

		expect(tasks.map((task) => task.name)).toEqual(['A1', 'A2', 'B1', 'C1', 'C2']);
		expect(tasks.map((task) => `${task.location.filePath}#${task.location.line}`)).toEqual([
			'Daily/A.md#1',
			'Daily/A.md#2',
			'Daily/B.md#1',
			'Daily/C.md#1',
			'Daily/C.md#2',
		]);
		vi.useRealTimers();
	});

	it('respects bounded concurrency cap while scanning', async () => {
		vi.useFakeTimers();
		let active = 0;
		let maxActive = 0;
		const files = [
			{ path: 'Daily/A.md' },
			{ path: 'Daily/B.md' },
			{ path: 'Daily/C.md' },
			{ path: 'Daily/D.md' },
		];

		const app = {
			vault: {
				getMarkdownFiles: () => files,
				cachedRead: vi.fn(() => new Promise<string>((resolve) => {
					active += 1;
					maxActive = Math.max(maxActive, active);
					setTimeout(() => {
						active -= 1;
						resolve('- [ ] task');
					}, 20);
				})),
			},
		};
		const settings = {
			...DEFAULT_SETTINGS,
			captureSources: [normalizeCaptureSource({ path: 'Daily' })],
		};

		const run = collectAllCapturableTasks(app as any, settings, { concurrency: 2 });
		await vi.runAllTimersAsync();
		await run;

		expect(maxActive).toBe(2);
		vi.useRealTimers();
	});
});
