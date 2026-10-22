import { describe, expect, it } from 'vitest';
import type { ExternalTask } from '../integration/types';
import { importConfirmOptions } from './importConfirm';

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
		repeat: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		external: true,
		source_type: 'captured-checkbox',
		location: { filePath, line: 1 },
		fromPreviousDay: false,
	};
}

describe('importConfirmOptions', () => {
	it('puts task and file counts in the title', () => {
		const options = importConfirmOptions([
			buildTask('A', 'Daily/one.md'),
			buildTask('B', 'Daily/one.md'),
			buildTask('C', 'Daily/two.md'),
		]);
		expect(options.title).toBe('Found 3 tasks across 2 files.');
		expect(options.ctaLabel).toBe('Import 3 tasks');
	});

	it('previews the first five task names with their source files', () => {
		const options = importConfirmOptions(
			['one', 'two', 'three', 'four', 'five', 'six'].map((f, i) => buildTask('ABCDEF'[i], `Daily/${f}.md`)),
		);
		expect(options.list).toEqual(['A (one.md)', 'B (two.md)', 'C (three.md)', 'D (four.md)', 'E (five.md)']);
	});

	it('is a constructive action, not a destructive one', () => {
		expect(importConfirmOptions([buildTask('A', 'Daily/one.md')]).ctaClass).toBe('mod-cta');
	});
});
