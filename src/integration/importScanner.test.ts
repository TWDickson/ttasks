import { describe, expect, it } from 'vitest';
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
});
