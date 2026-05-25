import { describe, expect, it, vi } from 'vitest';
import type { ExternalTask } from '../integration/types';
import { runMigrationImportFlow } from './migrationSettingsSection';

function buildTask(name: string, filePath: string): ExternalTask {
	return {
		id: `${name}-id`,
		slug: name,
		path: `${filePath}#L1`,
		type: 'task',
		name,
		area: null,
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: filePath,
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
		location: { filePath, line: 1 },
		fromPreviousDay: false,
	};
}

describe('runMigrationImportFlow', () => {
	it('uses aggregate summary Notice and detailed logs for mixed bulk failures', async () => {
		const notice = vi.fn();
		const log = vi.fn();
		const tasks = [buildTask('A', 'Daily/one.md'), buildTask('B', 'Daily/two.md')];
		let promoted = 0;

		await runMigrationImportFlow({
			plugin: {
				app: {},
				settings: {},
			} as any,
			collectTasks: async ({ onFileError }) => {
				onFileError(new Error('scan failed'), { operation: 'import.scanFile', filePath: 'Daily/scan.md' });
				return tasks;
			},
			confirmImport: async () => true,
			promoteTask: async (task) => {
				if (task.name === 'B') throw new Error('promote failed');
				promoted += 1;
			},
			notice,
			log,
		});

		expect(promoted).toBe(1);
		expect(log).toHaveBeenCalledTimes(2);
		expect(notice).toHaveBeenCalledTimes(1);
		expect(notice).toHaveBeenCalledWith('Imported 1 tasks (2 errors - see console).');
	});

	it('shows aggregate summary when scan errors happen before candidates are returned', async () => {
		const notice = vi.fn();
		const log = vi.fn();

		await runMigrationImportFlow({
			plugin: {
				app: {},
				settings: {},
			} as any,
			collectTasks: async ({ onFileError }) => {
				onFileError(new Error('scan failed'), { operation: 'import.scanFile', filePath: 'Daily/scan.md' });
				return [];
			},
			confirmImport: async () => true,
			promoteTask: async () => {},
			notice,
			log,
		});

		expect(log).toHaveBeenCalledTimes(1);
		expect(notice).toHaveBeenCalledWith('Imported 0 tasks (1 errors - see console).');
	});
});
