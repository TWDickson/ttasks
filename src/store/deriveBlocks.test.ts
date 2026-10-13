import { describe, expect, it } from 'vitest';
import { deriveBlocks } from './deriveBlocks';
import type { Task } from '../types';

function t(path: string, depends_on: string[] = [], blocks: string[] = []): Task {
	return {
		id: path, slug: '', path, type: 'task', name: path, area: null, status: 'Active', priority: 'None',
		labels: [], parent_task: null, depends_on, blocks, blocked_reason: '', assigned_to: '', source: '',
		start_date: null, due_date: null, due_time: null, estimated_days: null, workweek_only: false,
		holiday_dates: [], created: '2026-01-01', completed: null, status_changed: null, repeat: null, notes: '', is_complete: false, is_inbox: true,
	};
}

const blocksOf = (tasks: Task[], path: string) => tasks.find((x) => x.path === path)!.blocks;

describe('deriveBlocks', () => {
	it('is empty everywhere when nothing depends on anything', () => {
		const out = deriveBlocks([t('Tasks/a.md'), t('Tasks/b.md')]);
		expect(out.every((x) => x.blocks.length === 0)).toBe(true);
	});

	it('reverses a single dependency', () => {
		const out = deriveBlocks([t('Tasks/b.md', ['Tasks/a.md']), t('Tasks/a.md')]);
		expect(blocksOf(out, 'Tasks/a.md')).toEqual(['Tasks/b.md']);
		expect(blocksOf(out, 'Tasks/b.md')).toEqual([]);
	});

	it('aggregates several dependents, in the order the tasks are held', () => {
		const out = deriveBlocks([t('Tasks/a.md'), t('Tasks/b.md', ['Tasks/a.md']), t('Tasks/c.md', ['Tasks/a.md'])]);
		expect(blocksOf(out, 'Tasks/a.md')).toEqual(['Tasks/b.md', 'Tasks/c.md']);
	});

	it('follows a chain A→B→C one hop at a time', () => {
		const out = deriveBlocks([t('Tasks/a.md'), t('Tasks/b.md', ['Tasks/a.md']), t('Tasks/c.md', ['Tasks/b.md'])]);
		expect(blocksOf(out, 'Tasks/a.md')).toEqual(['Tasks/b.md']);
		expect(blocksOf(out, 'Tasks/b.md')).toEqual(['Tasks/c.md']);
		expect(blocksOf(out, 'Tasks/c.md')).toEqual([]);
	});

	it('lists a dependent once even if it depends on the same task twice', () => {
		const out = deriveBlocks([t('Tasks/a.md'), t('Tasks/b.md', ['Tasks/a.md', 'Tasks/a'])]);
		expect(blocksOf(out, 'Tasks/a.md')).toEqual(['Tasks/b.md']);
	});

	it('matches a dependency written without the extension', () => {
		const out = deriveBlocks([t('Tasks/a.md'), t('Tasks/b.md', ['Tasks/a'])]);
		expect(blocksOf(out, 'Tasks/a.md')).toEqual(['Tasks/b.md']);
	});

	it('ignores a dependency on a task that is not held', () => {
		const out = deriveBlocks([t('Tasks/b.md', ['Tasks/gone.md'])]);
		expect(out[0]!.blocks).toEqual([]);
	});

	it('overwrites a stale or hand-edited blocks value', () => {
		const out = deriveBlocks([t('Tasks/a.md', [], ['Tasks/stale.md']), t('Tasks/b.md')]);
		expect(blocksOf(out, 'Tasks/a.md')).toEqual([]);
	});

	it('keeps object identity for tasks whose blocks are already right', () => {
		const a = t('Tasks/a.md', [], ['Tasks/b.md']);
		const b = t('Tasks/b.md', ['Tasks/a.md']);
		const c = t('Tasks/c.md');
		const out = deriveBlocks([a, b, c]);
		expect(out[0]).toBe(a);
		expect(out[1]).toBe(b);
		expect(out[2]).toBe(c);
	});

	it('does not mutate its input', () => {
		const a = t('Tasks/a.md');
		deriveBlocks([a, t('Tasks/b.md', ['Tasks/a.md'])]);
		expect(a.blocks).toEqual([]);
	});
});
