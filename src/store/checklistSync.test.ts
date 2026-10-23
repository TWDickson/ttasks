import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
	buildChecklistChildInput,
	checklistLinksInBody,
	planChildSync,
	rewriteParentChecklist,
} from './checklistSync';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'child',
		path: 'Tasks/abc123-child.md',
		type: 'task',
		name: 'Child',
		area: 'Work',
		status: 'Active',
		priority: 'High',
		labels: ['bug'],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: 'me',
		source: 'src',
		start_date: '2026-10-01',
		due_date: '2026-10-30',
		due_time: null,
		estimated_days: null,
		workweek_only: false,
		holiday_dates: [],
		created: '2026-10-01',
		completed: null,
		notes: '',
		repeat: null,
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

const TODAY = '2026-10-23';

function plan(wanted: Map<string, boolean>, tasks: Task[], parentPath = 'Tasks/p.md') {
	return planChildSync({
		parentPath,
		wanted,
		tasksByPath: new Map(tasks.map((t) => [t.path, t])),
		completionStatus: 'Done',
		fallbackStatus: 'Active',
		today: TODAY,
	});
}

describe('checklistLinksInBody', () => {
	it('maps each linked checklist item to its checked state, adding .md', () => {
		const body = [
			'- [x] [[Tasks/a|A]]',
			'  - [ ] [[Tasks/b.md]]',
			'- [ ] plain item',
			'- not a checklist [[Tasks/c]]',
		].join('\n');

		expect([...checklistLinksInBody(body)]).toEqual([
			['Tasks/a.md', true],
			['Tasks/b.md', false],
		]);
	});
});

describe('planChildSync', () => {
	it('completes a child whose box is ticked', () => {
		const child = makeTask();
		expect(plan(new Map([[child.path, true]]), [child])).toEqual([{ kind: 'complete', task: child }]);
	});

	it('reopens a completed child whose box is unticked', () => {
		const child = makeTask({ status: 'Done', completed: '2026-10-20' });
		expect(plan(new Map([[child.path, false]]), [child])).toEqual([
			{ kind: 'update', path: child.path, status: 'Active', completed: null },
		]);
	});

	it('keeps a non-complete status when unticking, clearing only a stray completed date', () => {
		const child = makeTask({ status: 'Hold', completed: '2026-10-20' });
		expect(plan(new Map([[child.path, false]]), [child])).toEqual([
			{ kind: 'update', path: child.path, status: 'Hold', completed: null },
		]);
	});

	it('skips children already in step, unknown paths, and a self-link', () => {
		const open = makeTask();
		const done = makeTask({ path: 'Tasks/done.md', status: 'Done', completed: TODAY });
		const wanted = new Map([
			[open.path, false],
			[done.path, true],
			['Tasks/missing.md', true],
			['Tasks/p.md', true],
		]);
		expect(plan(wanted, [open, done, makeTask({ path: 'Tasks/p.md' })])).toEqual([]);
	});
});

describe('rewriteParentChecklist', () => {
	it('ticks every line linking the child, with or without .md, keeping indent and alias', () => {
		const body = [
			'- [ ] [[Tasks/child|Child]] trailing',
			'\t- [ ] [[Tasks/child.md]]',
			'- [ ] [[Tasks/other|Other]]',
		].join('\n');

		expect(rewriteParentChecklist(body, 'Tasks/child.md', true)).toBe([
			'- [x] [[Tasks/child|Child]] trailing',
			'\t- [x] [[Tasks/child.md]]',
			'- [ ] [[Tasks/other|Other]]',
		].join('\n'));
	});

	it('unticks, and returns null when nothing changes', () => {
		expect(rewriteParentChecklist('- [X] [[Tasks/child]]', 'Tasks/child.md', false)).toBe('- [ ] [[Tasks/child]]');
		expect(rewriteParentChecklist('- [x] [[Tasks/child]]', 'Tasks/child.md', true)).toBeNull();
		expect(rewriteParentChecklist('- [ ] [[Tasks/other]]', 'Tasks/child.md', true)).toBeNull();
	});
});

describe('buildChecklistChildInput', () => {
	it('inherits area/status/priority/labels/owner/source/start from the parent, not dates or deps', () => {
		const parent = makeTask({ depends_on: ['Tasks/x.md'], due_date: '2026-11-01' });
		const input = buildChecklistChildInput(parent, 'New child', 'Tasks/p.md', TODAY);

		expect(input).toMatchObject({
			type: 'task',
			name: 'New child',
			area: 'Work',
			status: 'Active',
			priority: 'High',
			labels: ['bug'],
			assigned_to: 'me',
			source: 'src',
			start_date: '2026-10-01',
			parent_task: 'Tasks/p',
			depends_on: [],
			due_date: null,
			created: TODAY,
		});
		expect(input.labels).not.toBe(parent.labels);
	});
});
