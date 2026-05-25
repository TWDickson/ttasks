import { describe, expect, it, vi } from 'vitest';

const noticeSpy = vi.fn();

vi.mock('obsidian', async () => {
	const actual = await vi.importActual<typeof import('obsidian')>('obsidian');
	class Notice {
		constructor(message: string) {
			noticeSpy(message);
		}
	}
	return {
		...actual,
		Notice,
	};
});

import { TFile } from 'obsidian';
import type { ExternalTask } from './types';
import { promoteTaskToTTasks } from './promoteTaskToTTasks';

function buildExternalTask(): ExternalTask {
	return {
		id: 'ext-1',
		slug: 'line-1',
		path: 'Daily/2026-05-25.md#L1',
		type: 'task',
		name: 'Captured task',
		area: null,
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: 'Daily/2026-05-25.md',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: null,
		completed: null,
		status_changed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		external: true,
		source_type: 'captured-checkbox',
		location: { filePath: 'Daily/2026-05-25.md', line: 1 },
		fromPreviousDay: false,
	};
}

describe('promoteTaskToTTasks', () => {
	it('shows one concise Notice and logs details when rescan fails', async () => {
		noticeSpy.mockReset();
		const sourceFile = new TFile();
		sourceFile.path = 'Daily/2026-05-25.md';
		const log = vi.fn();

		const plugin = {
			app: {
				vault: {
					getAbstractFileByPath: vi.fn().mockReturnValue(sourceFile),
					process: vi.fn(async (_file: TFile, processor: (content: string) => string) => processor('- [ ] old')),
				},
			},
			settings: {
				statuses: ['Active'],
				captureSources: [{ path: 'Daily', includeSubdirectories: true, mode: 'auto-capture', sectionFilter: '', inheritDateFromFilename: true, defaults: { area: null, labels: [], status: null, priority: null, assignedTo: null } }],
				tasksFolder: 'Tasks',
			},
			taskStore: {
				create: vi.fn().mockResolvedValue({ path: 'Tasks/abc123-captured-task.md', name: 'Captured task' }),
			},
			scanEngine: {
				removeTasksForFile: vi.fn(),
				rescanFile: vi.fn().mockRejectedValue(new Error('rescan failed')),
			},
			log,
		} as any;

		const created = await promoteTaskToTTasks(buildExternalTask(), plugin);

		expect(created.name).toBe('Captured task');
		expect(noticeSpy).toHaveBeenCalledTimes(1);
		expect(noticeSpy).toHaveBeenCalledWith('TTasks: task promoted, but capture refresh failed.');
		expect(log).toHaveBeenCalledTimes(1);
	});
});
