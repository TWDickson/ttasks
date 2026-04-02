import { describe, expect, it, vi } from 'vitest';
import { materializeChecklistChildren } from './checklistMaterializer';

function extractChecklistLink(line: string): { checked: boolean; path: string } | null {
	const match = line.match(/^\s*- \[( |x|X)\]\s+\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
	if (!match) return null;
	return {
		checked: (match[1] ?? ' ').toLowerCase() === 'x',
		path: match[2]?.endsWith('.md') ? match[2] : `${match[2]}.md`,
	};
}

describe('TaskStore checklist child materialization', () => {
	it('preserves nested hierarchy for newly created checklist children', async () => {
		const createChecklistChild = vi.fn(async (content: string, parentPath: string) => {
			void parentPath;
			const slug = content.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
			return { path: `Planner/Tasks/${slug}.md`, name: content };
		});

		const body = [
			'- [ ] First child',
			'  - [ ] Grandchild',
			'    - [ ] Great grandchild',
		].join('\n');

		const rewritten = await materializeChecklistChildren({
			body,
			parentPath: 'Planner/Tasks/root-task.md',
			extractChecklistLink,
			createChecklistChild,
		});

		expect(createChecklistChild).toHaveBeenCalledTimes(3);
		expect(createChecklistChild.mock.calls.map(([, parentPath]) => parentPath)).toEqual([
			'Planner/Tasks/root-task.md',
			'Planner/Tasks/first-child.md',
			'Planner/Tasks/grandchild.md',
		]);
		expect(rewritten).toBe([
			'- [ ] [[Planner/Tasks/first-child|First child]]',
			'  - [ ] [[Planner/Tasks/grandchild|Grandchild]]',
			'    - [ ] [[Planner/Tasks/great-grandchild|Great grandchild]]',
		].join('\n'));
	});

	it('uses the nearest shallower linked ancestor for irregular indentation', async () => {
		const createChecklistChild = vi.fn(async (content: string, parentPath: string) => {
			void parentPath;
			const slug = content.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
			return { path: `Planner/Tasks/${slug}.md`, name: content };
		});

		const body = [
			'- [ ] [[Planner/Tasks/existing-child|Existing child]]',
			'      - [ ] Deep child',
			'   - [ ] Odd-indent sibling',
		].join('\n');

		const rewritten = await materializeChecklistChildren({
			body,
			parentPath: 'Planner/Tasks/root-task.md',
			extractChecklistLink,
			createChecklistChild,
		});

		expect(createChecklistChild).toHaveBeenCalledTimes(2);
		expect(createChecklistChild.mock.calls.map(([, parentPath]) => parentPath)).toEqual([
			'Planner/Tasks/existing-child.md',
			'Planner/Tasks/existing-child.md',
		]);
		expect(rewritten).toBe([
			'- [ ] [[Planner/Tasks/existing-child|Existing child]]',
			'      - [ ] [[Planner/Tasks/deep-child|Deep child]]',
			'   - [ ] [[Planner/Tasks/odd-indent-sibling|Odd-indent sibling]]',
		].join('\n'));
	});
});