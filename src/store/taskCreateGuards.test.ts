import { describe, expect, it } from 'vitest';
import { getUniqueTaskPath, sanitizeDependsOnPaths, slugifyTaskName } from './taskCreateGuards';

describe('slugifyTaskName', () => {
	it('normalizes and trims task names', () => {
		expect(slugifyTaskName('  Build Graph MVP!!!  ')).toBe('build-graph-mvp');
	});

	it('falls back to task when slug would be empty', () => {
		expect(slugifyTaskName('$$$')).toBe('task');
	});
});

describe('getUniqueTaskPath', () => {
	it('retries until an available file path is found', () => {
		const ids = ['aaaaaa', 'bbbbbb'];
		const result = getUniqueTaskPath(
			'Planner/Tasks',
			'Test Task',
			(path) => path === 'Planner/Tasks/aaaaaa-test-task.md',
			64,
			() => ids.shift() ?? 'cccccc'
		);

		expect(result).not.toBeNull();
		expect(result?.shortId).toBe('bbbbbb');
		expect(result?.filePath).toBe('Planner/Tasks/bbbbbb-test-task.md');
	});

	it('returns null after max attempts', () => {
		const result = getUniqueTaskPath(
			'Planner/Tasks',
			'Test Task',
			() => true,
			2,
			() => 'aaaaaa'
		);
		expect(result).toBeNull();
	});
});

describe('sanitizeDependsOnPaths', () => {
	it('dedupes and removes invalid/self refs', () => {
		const out = sanitizeDependsOnPaths(
			[
				'Planner/Tasks/a-task',
				'Planner/Tasks/a-task',
				'Planner/Tasks/missing',
				'Planner/Tasks/self-task.md',
			],
			'Planner/Tasks/self-task.md',
			(path) => path === 'Planner/Tasks/a-task'
		);

		expect(out).toEqual(['Planner/Tasks/a-task']);
	});
});
