import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import {
	rewriteWikiLinkValue,
	realiasWikiLinkValue,
	filterOutDeletedPath,
	TaskRelationships,
} from './TaskRelationships';

describe('TaskRelationships.rewriteRelationshipAliases', () => {
	function vaultWith(notes: Record<string, Record<string, unknown>>) {
		const files = Object.keys(notes).map((path) => Object.assign(new TFile(), { path, extension: 'md' }));
		const plugin = {
			settings: { tasksFolder: 'Tasks' },
			logError: () => undefined,
			app: {
				vault: { getFolderByPath: () => ({ children: files }) },
				metadataCache: { getFileCache: (f: TFile) => ({ frontmatter: notes[f.path] }) },
				fileManager: {
					processFrontMatter: async (f: TFile, fn: (fm: Record<string, unknown>) => void) => fn(notes[f.path]!),
				},
			},
		} as any;
		return new TaskRelationships(plugin);
	}

	it('rewrites the alias in parent_task, depends_on and repeat_of, but not blocked_reason', async () => {
		const notes = {
			'Tasks/a.md': { ttask_name: 'Renamed' },
			'Tasks/b.md': {
				ttask_parent_task: '[[Tasks/a|Old]]',
				ttask_depends_on: ['[[Tasks/a|Old]]', '[[Tasks/c|C]]'],
				ttask_repeat_of: '[[Tasks/a]]',
				ttask_blocked_reason: 'waiting on [[Tasks/a|my words]]',
			},
			'Tasks/c.md': { ttask_depends_on: ['[[Tasks/ab|Not a]]'] },
		};
		await vaultWith(notes).rewriteRelationshipAliases('Tasks/a.md', 'Renamed');

		expect(notes['Tasks/b.md']).toEqual({
			ttask_parent_task: '[[Tasks/a|Renamed]]',
			ttask_depends_on: ['[[Tasks/a|Renamed]]', '[[Tasks/c|C]]'],
			ttask_repeat_of: '[[Tasks/a|Renamed]]',
			ttask_blocked_reason: 'waiting on [[Tasks/a|my words]]',
		});
		expect(notes['Tasks/c.md']).toEqual({ ttask_depends_on: ['[[Tasks/ab|Not a]]'] });
		expect(notes['Tasks/a.md']).toEqual({ ttask_name: 'Renamed' });
	});
});

describe('realiasWikiLinkValue', () => {
	it('replaces the alias on a link to the target', () => {
		expect(realiasWikiLinkValue('[[Tasks/abc-x|Old Name]]', 'Tasks/abc-x', 'New Name')).toBe('[[Tasks/abc-x|New Name]]');
	});

	it('gives a bare link to the target an alias', () => {
		expect(realiasWikiLinkValue('[[Tasks/abc-x]]', 'Tasks/abc-x', 'New Name')).toBe('[[Tasks/abc-x|New Name]]');
	});

	it('leaves links to other tasks alone, including ones sharing a prefix', () => {
		expect(realiasWikiLinkValue('[[Tasks/abc-xy|Other]]', 'Tasks/abc-x', 'New')).toBe('[[Tasks/abc-xy|Other]]');
	});

	it('takes a name containing $ literally', () => {
		expect(realiasWikiLinkValue('[[Tasks/a|Old]]', 'Tasks/a', 'Pay $& fees')).toBe('[[Tasks/a|Pay $& fees]]');
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
