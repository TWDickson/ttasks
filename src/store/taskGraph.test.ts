import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import { buildTaskGraph } from './taskGraph';

function makeTask(overrides: Partial<Task> & Pick<Task, 'path' | 'name'>): Task {
	const { path, name, ...rest } = overrides;
	return {
		id: path.slice(0, 6),
		slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		path,
		type: 'task',
		name,
		category: null,
		status: 'Active',
		priority: 'None',
		task_type: null,
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		estimated_days: null,
		created: '2026-04-02',
		completed: null,
		notes: '',
		...rest,
	};
}

describe('buildTaskGraph', () => {
	it('assigns dependency depth left to right for acyclic chains', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A' }),
			makeTask({ path: 'Tasks/b.md', name: 'B', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', depends_on: ['Tasks/b'] }),
		];

		const layout = buildTaskGraph(tasks, { completionStatus: 'Done' });
		const columns = new Map(layout.nodes.map((node) => [node.path, node.column]));

		expect(layout.edges).toHaveLength(2);
		expect(columns.get('Tasks/a.md')).toBe(0);
		expect(columns.get('Tasks/b.md')).toBe(1);
		expect(columns.get('Tasks/c.md')).toBe(2);
		expect(layout.maxDepth).toBe(2);
	});

	it('marks cycles and blocked dependency chains', () => {
		const tasks = [
			makeTask({ path: 'Tasks/a.md', name: 'A', status: 'Active', depends_on: ['Tasks/c'] }),
			makeTask({ path: 'Tasks/b.md', name: 'B', status: 'Active', depends_on: ['Tasks/a'] }),
			makeTask({ path: 'Tasks/c.md', name: 'C', status: 'Active', depends_on: ['Tasks/b'] }),
			makeTask({ path: 'Tasks/d.md', name: 'D', status: 'Done' }),
			makeTask({ path: 'Tasks/e.md', name: 'E', status: 'Active', depends_on: ['Tasks/d'] }),
		];

		const layout = buildTaskGraph(tasks, { completionStatus: 'Done' });
		const cycleNodes = layout.nodes.filter((node) => node.isCycle).map((node) => node.path).sort();
		const blockedNodes = layout.nodes.filter((node) => node.isBlockedChain).map((node) => node.path).sort();

		expect(cycleNodes).toEqual(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md']);
		expect(layout.edges.filter((edge) => edge.isCycle)).toHaveLength(3);
		expect(blockedNodes).toEqual(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md']);
		expect(layout.blockedEdgeCount).toBe(3);
	});
});