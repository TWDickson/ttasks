import { describe, expect, it } from 'vitest';
import {
	rewriteWikiLinkValue,
	filterOutDeletedPath,
} from './TaskRelationships';

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
