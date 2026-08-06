import { describe, it, expect } from 'vitest';
import type { Task } from '../types';
import {
	buildTaskRefIndex,
	isMissingRef,
	normalizeRefPath,
	resolveTaskRef,
	resolveTaskRefs,
	taskRefName,
	taskRefTask,
} from './taskRef';

function makeTask(path: string, name: string): Task {
	return { path, name } as Task;
}

const shipIt = makeTask('Planner/Tasks/a1b2c3-ship-it.md', 'Ship the API');
const signIt = makeTask('Planner/Tasks/d4e5f6-sign-it.md', 'Sign the contract');
const index = buildTaskRefIndex([shipIt, signIt]);

describe('normalizeRefPath', () => {
	it('trims and appends .md when absent', () => {
		expect(normalizeRefPath('  Tasks/foo  ')).toBe('Tasks/foo.md');
	});

	it('leaves an existing .md alone', () => {
		expect(normalizeRefPath('Tasks/foo.md')).toBe('Tasks/foo.md');
	});

	it.each([null, undefined, '', '   '])('returns null for %p', (path) => {
		expect(normalizeRefPath(path)).toBeNull();
	});
});

describe('resolveTaskRef', () => {
	// A resolved ref reports the task's *stored* path, not the link that found it,
	// so callers navigate to the real file.
	it('reports the full stored path for a short link', () => {
		expect(resolveTaskRef('a1b2c3-ship-it', index)!.path).toBe(shipIt.path);
	});

	it('reports the normalized path for an unresolvable link', () => {
		expect(resolveTaskRef('missing-task', index)!.path).toBe('missing-task.md');
	});

	it('resolves an exact path', () => {
		const ref = resolveTaskRef('Planner/Tasks/a1b2c3-ship-it.md', index);
		expect(ref).toEqual({ kind: 'task', path: shipIt.path, task: shipIt });
	});

	it('adds the missing .md extension', () => {
		expect(taskRefTask(resolveTaskRef('Planner/Tasks/a1b2c3-ship-it', index)!)).toBe(shipIt);
	});

	// A sibling note writes `[[a1b2c3-ship-it]]` with no folder; it must still find
	// the task. This is the short-wikilink fallback the linear scan used to do.
	it('resolves a short link with no folder', () => {
		expect(taskRefTask(resolveTaskRef('a1b2c3-ship-it.md', index)!)).toBe(shipIt);
	});

	it('resolves a partial folder suffix', () => {
		expect(taskRefTask(resolveTaskRef('Tasks/a1b2c3-ship-it.md', index)!)).toBe(shipIt);
	});

	// The suffix must line up on a folder boundary, so a partial path can't claim
	// a same-named task living somewhere else.
	it('does not let a mismatched folder claim a same-named task', () => {
		const other = makeTask('Archive/Old/a1b2c3-ship-it.md', 'Old ship it');
		const twoFolders = buildTaskRefIndex([other]);
		const ref = resolveTaskRef('Current/a1b2c3-ship-it.md', twoFolders);
		expect(isMissingRef(ref!)).toBe(true);
	});

	it('yields a missing ref carrying the task id', () => {
		const ref = resolveTaskRef('Planner/Tasks/999999-gone.md', index);
		expect(ref).toEqual({ kind: 'missing', path: 'Planner/Tasks/999999-gone.md', id: '999999' });
	});

	// Absent and unresolvable are different: absent means there's no link at all.
	it.each([null, undefined, '', '   '])('returns null for the absent link %p', (path) => {
		expect(resolveTaskRef(path, index)).toBeNull();
	});

	it('prefers an exact match over a suffix match', () => {
		const nested = makeTask('Deep/Planner/Tasks/a1b2c3-ship-it.md', 'Nested');
		const both = buildTaskRefIndex([nested, shipIt]);
		expect(taskRefTask(resolveTaskRef('Planner/Tasks/a1b2c3-ship-it.md', both)!)).toBe(shipIt);
	});

	it('takes the first insertion when two folders hold the same filename', () => {
		const first = makeTask('A/x1y2z3-dup.md', 'First');
		const second = makeTask('B/x1y2z3-dup.md', 'Second');
		const dupes = buildTaskRefIndex([first, second]);
		expect(taskRefTask(resolveTaskRef('x1y2z3-dup.md', dupes)!)).toBe(first);
	});
});

describe('resolveTaskRefs', () => {
	it('resolves an array, keeping missing entries visible', () => {
		const refs = resolveTaskRefs(
			['Planner/Tasks/a1b2c3-ship-it.md', 'Planner/Tasks/999999-gone.md'],
			index,
		);
		expect(refs.map((r) => r.kind)).toEqual(['task', 'missing']);
	});

	it('de-duplicates links that resolve to the same task', () => {
		const refs = resolveTaskRefs(
			['Planner/Tasks/a1b2c3-ship-it.md', 'a1b2c3-ship-it', 'Planner/Tasks/a1b2c3-ship-it'],
			index,
		);
		expect(refs).toHaveLength(1);
	});

	it('drops absent links without dropping unresolvable ones', () => {
		const refs = resolveTaskRefs(['', 'Planner/Tasks/999999-gone.md', '   '], index);
		expect(refs).toHaveLength(1);
		expect(refs[0].kind).toBe('missing');
	});

	it('preserves input order', () => {
		const refs = resolveTaskRefs(
			['Planner/Tasks/d4e5f6-sign-it.md', 'Planner/Tasks/a1b2c3-ship-it.md'],
			index,
		);
		expect(refs.map(taskRefName)).toEqual(['Sign the contract', 'Ship the API']);
	});
});

describe('taskRefName', () => {
	// The whole point: a resolved ref reads its name off the task, full stop.
	it('reads the name straight off the task', () => {
		expect(taskRefName(resolveTaskRef(shipIt.path, index)!)).toBe('Ship the API');
	});

	it('formats a missing ref with its id and never its slug', () => {
		const name = taskRefName(resolveTaskRef('Planner/Tasks/999999-gone.md', index)!);
		expect(name).toBe('Missing task (999999)');
		expect(name).not.toContain('gone');
	});
});

describe('buildTaskRefIndex', () => {
	it('handles an empty task list', () => {
		const empty = buildTaskRefIndex([]);
		expect(isMissingRef(resolveTaskRef('Tasks/a1b2c3-x.md', empty)!)).toBe(true);
	});
});
