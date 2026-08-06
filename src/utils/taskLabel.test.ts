import { describe, it, expect } from 'vitest';
import { MISSING_TASK_LABEL, missingTaskLabel } from './taskLabel';

describe('missingTaskLabel', () => {
	it('surfaces the task id so hash-prefix search can find the dangling link', () => {
		expect(missingTaskLabel('Tasks/6d1f2a-scrape-the-barnacles.md')).toBe('Missing task (6d1f2a)');
	});

	it('works on a path that already had its extension stripped', () => {
		expect(missingTaskLabel('Tasks/6d1f2a-scrape-the-barnacles')).toBe('Missing task (6d1f2a)');
	});

	// The whole point of the change: a slug must never reach the UI looking like
	// a title. A note that doesn't follow `{hex}-{slug}` contributes no id.
	it('does not echo the filename back for a non-task note', () => {
		expect(missingTaskLabel('Notes/Some Meeting Note.md')).toBe(MISSING_TASK_LABEL);
	});

	it('rejects a non-hex leading segment as an id', () => {
		expect(missingTaskLabel('Tasks/zzzz-not-an-id.md')).toBe(MISSING_TASK_LABEL);
	});

	it.each([null, undefined, '', '   '])('degrades to the bare placeholder for %p', (path) => {
		expect(missingTaskLabel(path)).toBe(MISSING_TASK_LABEL);
	});
});
