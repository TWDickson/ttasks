import { describe, it, expect } from 'vitest';
import { MISSING_TASK_LABEL, missingTaskLabel, resolveTaskLabel, resolveTaskLabelFromMap } from './taskLabel';

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

describe('resolveTaskLabel', () => {
	it('prefers the resolved name', () => {
		const label = resolveTaskLabel('Tasks/6d1f2a-scrape.md', () => 'Scrape the barnacles off first');
		expect(label).toEqual({ text: 'Scrape the barnacles off first', resolved: true });
	});

	it('trims a padded name', () => {
		expect(resolveTaskLabel('Tasks/6d1f2a-scrape.md', () => '  Walk Gary  ').text).toBe('Walk Gary');
	});

	it('flags an unknown path as unresolved', () => {
		const label = resolveTaskLabel('Tasks/6d1f2a-scrape.md', () => null);
		expect(label).toEqual({ text: 'Missing task (6d1f2a)', resolved: false });
	});

	// An empty `name:` field is the same data defect as a missing note — both mean
	// the model can't tell us what this task is called.
	it('treats a blank name as unresolved rather than rendering empty text', () => {
		const label = resolveTaskLabel('Tasks/6d1f2a-scrape.md', () => '   ');
		expect(label).toEqual({ text: 'Missing task (6d1f2a)', resolved: false });
	});

	it('never consults the resolver for an empty path', () => {
		let calls = 0;
		const label = resolveTaskLabel('', () => { calls++; return 'nope'; });
		expect(calls).toBe(0);
		expect(label).toEqual({ text: MISSING_TASK_LABEL, resolved: false });
	});

	it('passes the trimmed path to the resolver', () => {
		const seen: string[] = [];
		resolveTaskLabel('  Tasks/6d1f2a-scrape.md  ', (p) => { seen.push(p); return null; });
		expect(seen).toEqual(['Tasks/6d1f2a-scrape.md']);
	});
});

describe('resolveTaskLabelFromMap', () => {
	it('reads through the map', () => {
		const names = new Map([['Tasks/6d1f2a-scrape.md', 'Scrape the barnacles']]);
		expect(resolveTaskLabelFromMap('Tasks/6d1f2a-scrape.md', names).text).toBe('Scrape the barnacles');
		expect(resolveTaskLabelFromMap('Tasks/aaaaaa-gone.md', names)).toEqual({
			text: 'Missing task (aaaaaa)',
			resolved: false,
		});
	});
});
