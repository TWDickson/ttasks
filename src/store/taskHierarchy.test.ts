import { describe, expect, it } from 'vitest';
import { flattenWithDepth, buildVisibleItems, getParentPaths } from './taskHierarchy';
import type { Task } from '../types';

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task>): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Tasks/task.md',
		type: 'task',
		name: 'Task',
		area: null,
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		estimated_days: null,
		created: '2026-04-20',
		completed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		status_changed: null,
		...overrides,
	};
}

// ── flattenWithDepth ──────────────────────────────────────────────────────────

describe('flattenWithDepth', () => {
	it('returns flat tasks at depth 0', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B' }),
		];
		const result = flattenWithDepth(tasks);
		expect(result).toHaveLength(2);
		expect(result[0].depth).toBe(0);
		expect(result[1].depth).toBe(0);
	});

	it('places a child under its parent at depth 1', () => {
		const parent = makeTask({ path: 'Tasks/parent.md', name: 'Parent' });
		const child = makeTask({ path: 'Tasks/child.md', name: 'Child', parent_task: 'Tasks/parent' });
		const result = flattenWithDepth([parent, child]);
		expect(result.map(i => i.task.name)).toEqual(['Parent', 'Child']);
		expect(result.map(i => i.depth)).toEqual([0, 1]);
	});

	it('treats a child whose parent is not in the list as a root', () => {
		const child = makeTask({ path: 'Tasks/child.md', name: 'Child', parent_task: 'Tasks/missing' });
		const result = flattenWithDepth([child]);
		expect(result).toHaveLength(1);
		expect(result[0].depth).toBe(0);
	});

	it('handles nested depth 2', () => {
		const gp = makeTask({ path: 'Tasks/gp.md', name: 'Grandparent' });
		const p  = makeTask({ path: 'Tasks/p.md',  name: 'Parent',      parent_task: 'Tasks/gp' });
		const c  = makeTask({ path: 'Tasks/c.md',  name: 'Child',       parent_task: 'Tasks/p'  });
		const result = flattenWithDepth([gp, p, c]);
		expect(result.map(i => i.task.name)).toEqual(['Grandparent', 'Parent', 'Child']);
		expect(result.map(i => i.depth)).toEqual([0, 1, 2]);
	});

	it('accepts parent_task stored with .md extension', () => {
		const parent = makeTask({ path: 'Tasks/parent.md', name: 'Parent' });
		const child  = makeTask({ path: 'Tasks/child.md',  name: 'Child', parent_task: 'Tasks/parent.md' });
		const result = flattenWithDepth([parent, child]);
		expect(result[1].depth).toBe(1);
	});

	it('renders siblings of a parent after its subtree', () => {
		const a      = makeTask({ path: 'Tasks/a.md',       name: 'A' });
		const aChild = makeTask({ path: 'Tasks/a-child.md', name: 'A-child', parent_task: 'Tasks/a' });
		const b      = makeTask({ path: 'Tasks/b.md',       name: 'B' });
		const result = flattenWithDepth([a, aChild, b]);
		expect(result.map(i => i.task.name)).toEqual(['A', 'A-child', 'B']);
		expect(result.map(i => i.depth)).toEqual([0, 1, 0]);
	});

	it('breaks cycles gracefully and includes both nodes', () => {
		const a = makeTask({ path: 'Tasks/a.md', name: 'A', parent_task: 'Tasks/b' });
		const b = makeTask({ path: 'Tasks/b.md', name: 'B', parent_task: 'Tasks/a' });
		const result = flattenWithDepth([a, b]);
		expect(result).toHaveLength(2);
	});
});

// ── buildVisibleItems ─────────────────────────────────────────────────────────

describe('buildVisibleItems', () => {
	it('returns all items when nothing is collapsed', () => {
		const items = [
			{ task: makeTask({ path: 'Tasks/a.md' }), depth: 0 },
			{ task: makeTask({ path: 'Tasks/b.md' }), depth: 1 },
		];
		expect(buildVisibleItems(items, new Set())).toHaveLength(2);
	});

	it('hides direct children when parent is collapsed', () => {
		const parent = makeTask({ path: 'Tasks/parent.md' });
		const child  = makeTask({ path: 'Tasks/child.md'  });
		const items = [
			{ task: parent, depth: 0 },
			{ task: child,  depth: 1 },
		];
		const visible = buildVisibleItems(items, new Set([parent.path]));
		expect(visible).toHaveLength(1);
		expect(visible[0].task.path).toBe(parent.path);
	});

	it('hides entire subtree when grandparent is collapsed', () => {
		const gp    = makeTask({ path: 'Tasks/gp.md' });
		const p     = makeTask({ path: 'Tasks/p.md'  });
		const child = makeTask({ path: 'Tasks/c.md'  });
		const items = [
			{ task: gp,    depth: 0 },
			{ task: p,     depth: 1 },
			{ task: child, depth: 2 },
		];
		const visible = buildVisibleItems(items, new Set([gp.path]));
		expect(visible).toHaveLength(1);
	});

	it('shows siblings after a collapsed subtree', () => {
		const a      = makeTask({ path: 'Tasks/a.md'       });
		const aChild = makeTask({ path: 'Tasks/a-child.md' });
		const b      = makeTask({ path: 'Tasks/b.md'       });
		const items = [
			{ task: a,      depth: 0 },
			{ task: aChild, depth: 1 },
			{ task: b,      depth: 0 },
		];
		const visible = buildVisibleItems(items, new Set([a.path]));
		expect(visible.map(i => i.task.path)).toEqual([a.path, b.path]);
	});
});

// ── getParentPaths ────────────────────────────────────────────────────────────

describe('getParentPaths', () => {
	it('identifies tasks with children', () => {
		const a = makeTask({ path: 'Tasks/a.md' });
		const b = makeTask({ path: 'Tasks/b.md' });
		const c = makeTask({ path: 'Tasks/c.md' });
		const items = [
			{ task: a, depth: 0 },
			{ task: b, depth: 1 }, // child of a
			{ task: c, depth: 0 }, // sibling of a, no children
		];
		const parents = getParentPaths(items);
		expect(parents.has(a.path)).toBe(true);
		expect(parents.has(b.path)).toBe(false);
		expect(parents.has(c.path)).toBe(false);
	});

	it('returns empty set for a flat list', () => {
		const items = [
			{ task: makeTask({ path: 'Tasks/a.md' }), depth: 0 },
			{ task: makeTask({ path: 'Tasks/b.md' }), depth: 0 },
		];
		expect(getParentPaths(items).size).toBe(0);
	});

	it('returns empty set for an empty list', () => {
		expect(getParentPaths([]).size).toBe(0);
	});
});
