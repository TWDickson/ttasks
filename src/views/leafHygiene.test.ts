import { describe, expect, it } from 'vitest';
import { repairPluginLeaves, type HygieneLeaf } from './leafHygiene';

const OWNED = ['ttasks-rail', 'ttasks-detail', 'ttasks-pomodoro'] as const;

interface FakeLeaf extends HygieneLeaf {
	detached: boolean;
	liveType: string;
}

/**
 * `liveType` is what the leaf's live view reports; `persistedType` is what the
 * saved layout says it is. A ghost is the case where they disagree — Obsidian
 * restored the tab but had no registered view to build.
 */
function makeLeaf(persistedType: string, liveType = persistedType, state?: Record<string, unknown>): FakeLeaf {
	const leaf: FakeLeaf = {
		detached: false,
		liveType,
		getViewState: () => ({ type: persistedType, state }),
		setViewState: (next) => { leaf.liveType = next.type; },
		detach: () => { leaf.detached = true; },
		view: { getViewType: () => leaf.liveType },
	};
	return leaf;
}

function workspaceOf(leaves: FakeLeaf[]) {
	return { iterateAllLeaves: (cb: (leaf: HygieneLeaf) => void) => leaves.forEach(cb) };
}

describe('repairPluginLeaves', () => {
	it('rehydrates a ghost leaf whose live view is not the type it persisted', async () => {
		const ghost = makeLeaf('ttasks-rail', 'empty');

		const result = await repairPluginLeaves(workspaceOf([ghost]), OWNED);

		expect(ghost.liveType).toBe('ttasks-rail');
		expect(ghost.detached).toBe(false);
		expect(result).toEqual({ rehydrated: 1, detached: 0 });
	});

	it('carries the ghost\'s persisted state across the rehydrate', async () => {
		const seen: Record<string, unknown>[] = [];
		const ghost = makeLeaf('ttasks-detail', 'empty', { taskPath: 'Tasks/a1b2c3-thing.md' });
		ghost.setViewState = (next) => { seen.push(next.state ?? {}); };

		await repairPluginLeaves(workspaceOf([ghost]), OWNED);

		expect(seen).toEqual([{ taskPath: 'Tasks/a1b2c3-thing.md' }]);
	});

	it('collapses a ghost plus its replacement down to one leaf', async () => {
		// The exact shape of the reported bug: a dead tab from the session where
		// the plugin was absent, and the fresh one we opened beside it.
		const ghost = makeLeaf('ttasks-pomodoro', 'empty');
		const replacement = makeLeaf('ttasks-pomodoro');

		const result = await repairPluginLeaves(workspaceOf([ghost, replacement]), OWNED);

		expect(ghost.detached).toBe(false);
		expect(ghost.liveType).toBe('ttasks-pomodoro');
		expect(replacement.detached).toBe(true);
		expect(result).toEqual({ rehydrated: 1, detached: 1 });
	});

	it('keeps the earliest leaf so the user\'s sidebar order survives', async () => {
		const first = makeLeaf('ttasks-rail');
		const second = makeLeaf('ttasks-rail');
		const third = makeLeaf('ttasks-rail');

		const result = await repairPluginLeaves(workspaceOf([first, second, third]), OWNED);

		expect([first.detached, second.detached, third.detached]).toEqual([false, true, true]);
		expect(result).toEqual({ rehydrated: 0, detached: 2 });
	});

	it('leaves a healthy single leaf of each type completely alone', async () => {
		const leaves = OWNED.map((type) => makeLeaf(type));

		const result = await repairPluginLeaves(workspaceOf(leaves), OWNED);

		expect(leaves.every((leaf) => !leaf.detached)).toBe(true);
		expect(result).toEqual({ rehydrated: 0, detached: 0 });
	});

	it('never touches leaves belonging to anyone else', async () => {
		// Including another plugin's ghost — a dead `dataview` tab is not ours to
		// revive or close, and duplicate markdown tabs are a normal thing to have.
		const foreignGhost = makeLeaf('dataview-view', 'empty');
		const markdownA = makeLeaf('markdown');
		const markdownB = makeLeaf('markdown');

		const result = await repairPluginLeaves(workspaceOf([foreignGhost, markdownA, markdownB]), OWNED);

		expect(foreignGhost.detached).toBe(false);
		expect(foreignGhost.liveType).toBe('empty');
		expect(markdownB.detached).toBe(false);
		expect(result).toEqual({ rehydrated: 0, detached: 0 });
	});

	it('ignores a leaf Obsidian stripped of its persisted type', async () => {
		// Once the type is gone there is nothing distinguishing this from an
		// ordinary empty tab the user opened, so it stays.
		const stripped = makeLeaf('', 'empty');

		const result = await repairPluginLeaves(workspaceOf([stripped]), OWNED);

		expect(stripped.detached).toBe(false);
		expect(result).toEqual({ rehydrated: 0, detached: 0 });
	});
});
