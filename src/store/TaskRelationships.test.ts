import { describe, expect, it } from 'vitest';
import {
	buildBlocksReverseIndex,
	rewriteWikiLinkValue,
	filterOutDeletedPath,
} from './TaskRelationships';

describe('buildBlocksReverseIndex', () => {
	it('returns empty map for empty input', () => {
		const result = buildBlocksReverseIndex([]);
		expect(result.size).toBe(0);
	});

	it('returns empty map when no task has dependencies', () => {
		const tasks = [
			{ path: 'Tasks/a.md', name: 'Task A', depends_on: [] },
			{ path: 'Tasks/b.md', name: 'Task B', depends_on: [] },
		];
		expect(buildBlocksReverseIndex(tasks).size).toBe(0);
	});

	it('builds reverse index for a single dependency', () => {
		const tasks = [
			{ path: 'Tasks/b.md', name: 'Task B', depends_on: ['Tasks/a.md'] },
			{ path: 'Tasks/a.md', name: 'Task A', depends_on: [] },
		];
		const result = buildBlocksReverseIndex(tasks);
		expect(result.get('Tasks/a')).toEqual([{ path: 'Tasks/b', name: 'Task B' }]);
	});

	it('strips .md from dep paths when building reverse index', () => {
		const tasks = [
			{ path: 'Tasks/b.md', name: 'Task B', depends_on: ['Tasks/a.md'] },
		];
		const result = buildBlocksReverseIndex(tasks);
		const key = [...result.keys()][0];
		expect(key).toBe('Tasks/a');
		expect(result.get(key)![0]!.path).toBe('Tasks/b');
	});

	it('aggregates multiple dependents for the same task', () => {
		const tasks = [
			{ path: 'Tasks/b.md', name: 'Task B', depends_on: ['Tasks/a.md'] },
			{ path: 'Tasks/c.md', name: 'Task C', depends_on: ['Tasks/a.md'] },
		];
		const result = buildBlocksReverseIndex(tasks);
		const blockers = result.get('Tasks/a')!;
		expect(blockers).toHaveLength(2);
		expect(blockers.map(b => b.name)).toContain('Task B');
		expect(blockers.map(b => b.name)).toContain('Task C');
	});

	it('handles chain dependencies A→B→C', () => {
		const tasks = [
			{ path: 'Tasks/a.md', name: 'Task A', depends_on: [] },
			{ path: 'Tasks/b.md', name: 'Task B', depends_on: ['Tasks/a.md'] },
			{ path: 'Tasks/c.md', name: 'Task C', depends_on: ['Tasks/b.md'] },
		];
		const result = buildBlocksReverseIndex(tasks);
		expect(result.get('Tasks/a')?.map(b => b.name)).toEqual(['Task B']);
		expect(result.get('Tasks/b')?.map(b => b.name)).toEqual(['Task C']);
		expect(result.has('Tasks/c')).toBe(false);
	});

	it('handles a task with multiple dependencies', () => {
		const tasks = [
			{ path: 'Tasks/c.md', name: 'Task C', depends_on: ['Tasks/a.md', 'Tasks/b.md'] },
		];
		const result = buildBlocksReverseIndex(tasks);
		expect(result.get('Tasks/a')).toEqual([{ path: 'Tasks/c', name: 'Task C' }]);
		expect(result.get('Tasks/b')).toEqual([{ path: 'Tasks/c', name: 'Task C' }]);
	});
});

describe('rewriteWikiLinkValue', () => {
	it('rewrites a simple wiki link', () => {
		const pattern = /\[\[Tasks\/old(\|[^\]]+)?\]\]/g;
		const result = rewriteWikiLinkValue('[[Tasks/old|Old Name]]', pattern, 'Tasks/new');
		expect(result).toBe('[[Tasks/new|Old Name]]');
	});

	it('rewrites a wiki link without alias', () => {
		const pattern = /\[\[Tasks\/old(\|[^\]]+)?\]\]/g;
		const result = rewriteWikiLinkValue('[[Tasks/old]]', pattern, 'Tasks/new');
		expect(result).toBe('[[Tasks/new]]');
	});

	it('returns the same string when pattern does not match', () => {
		const pattern = /\[\[Tasks\/old(\|[^\]]+)?\]\]/g;
		const result = rewriteWikiLinkValue('[[Tasks/other|Other]]', pattern, 'Tasks/new');
		expect(result).toBe('[[Tasks/other|Other]]');
	});
});

describe('filterOutDeletedPath', () => {
	const parseFn = (v: unknown): string | null => {
		if (typeof v !== 'string') return null;
		const match = v.match(/\[\[([^\]|]+)/);
		return match?.[1] ?? null;
	};

	it('filters out links that resolve to the deleted path', () => {
		const links = ['[[Tasks/deleted|Deleted Task]]', '[[Tasks/other|Other Task]]'];
		const result = filterOutDeletedPath(links, 'Tasks/deleted', parseFn);
		expect(result).toEqual(['[[Tasks/other|Other Task]]']);
	});

	it('returns all links when none match the deleted path', () => {
		const links = ['[[Tasks/a|Task A]]', '[[Tasks/b|Task B]]'];
		const result = filterOutDeletedPath(links, 'Tasks/deleted', parseFn);
		expect(result).toHaveLength(2);
	});

	it('returns empty array for empty input', () => {
		expect(filterOutDeletedPath([], 'Tasks/deleted', parseFn)).toEqual([]);
	});

	it('filters multiple matches', () => {
		const links = [
			'[[Tasks/deleted|First]]',
			'[[Tasks/other|Other]]',
			'[[Tasks/deleted|Duplicate]]',
		];
		const result = filterOutDeletedPath(links, 'Tasks/deleted', parseFn);
		expect(result).toEqual(['[[Tasks/other|Other]]']);
	});
});
