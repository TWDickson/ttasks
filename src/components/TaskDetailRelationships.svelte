<script lang="ts">
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import type { FieldDefinition } from '../schema/types';
	import { getFieldByName } from '../schema/taskFields';
	import { buildTaskGraph } from '../store/graph/taskGraph';
	import { sortDependencyFirst } from '../utils/dependencySort';
	import { MAX_REL_TREE_DEPTH, MAX_REL_TREE_NODES } from '../constants';
	import WikiLinkField from './fields/WikiLinkField.svelte';

	export let task: Task;
	export let tasks: Task[];
	export let plugin: TTasksPlugin;
	export let onAddDependency: (path: string) => Promise<void>;
	export let onRemoveDependency: (path: string) => Promise<void>;
	export let onOpenTask: (path: string) => void;

	// ── Link helpers ────────────────────────────────────────────────────────────

	function normalizeTaskPath(pathLike: string | null | undefined): string | null {
		if (!pathLike) return null;
		const clean = pathLike.trim();
		if (!clean) return null;
		return clean.endsWith('.md') ? clean : `${clean}.md`;
	}

	function linkedTask(pathLike: string | null | undefined): Task | null {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return null;
		const exact = tasks.find((t) => t.path === normalized);
		if (exact) return exact;
		return tasks.find((t) => t.path.endsWith('/' + normalized)) ?? null;
	}

	function resolveTaskPath(pathLike: string | null | undefined): string | null {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return null;
		const found = linkedTask(normalized);
		return found ? found.path : normalized;
	}

	function taskLabelFromPath(pathLike: string | null | undefined): string {
		const normalized = normalizeTaskPath(pathLike);
		if (!normalized) return 'Unknown';
		const resolved = linkedTask(normalized);
		if (resolved) return resolved.name;
		return normalized.split('/').pop()?.replace(/^[a-f0-9]+-/, '').replace(/\.md$/, '') ?? normalized;
	}

	function openLinkedPath(pathLike: string): void {
		const resolved = resolveTaskPath(pathLike);
		if (!resolved) return;
		onOpenTask(resolved);
	}

	function showLinkedHoverPreview(event: MouseEvent, pathLike: string): void {
		const resolved = resolveTaskPath(pathLike);
		if (!resolved) return;
		plugin.triggerTaskHoverPreview(resolved, event);
	}

	// ── Relationship tree ───────────────────────────────────────────────────────

	type RelationshipDirection = 'upstream' | 'downstream';

	interface RelationshipTreeNode {
		key: string;
		path: string;
		label: string;
		depth: number;
		direction: RelationshipDirection;
		task: Task | null;
		isMissing: boolean;
		isBlocked: boolean;
	}

	interface RelationshipTreeLevel {
		depth: number;
		nodes: RelationshipTreeNode[];
	}

	function normalizeTaskPaths(paths: string[]): string[] {
		const seen = new Set<string>();
		const normalized: string[] = [];
		for (const path of paths) {
			const next = resolveTaskPath(path);
			if (!next || seen.has(next)) continue;
			seen.add(next);
			normalized.push(next);
		}
		return normalized;
	}

	function buildRelationshipTree(startPaths: string[], direction: RelationshipDirection): RelationshipTreeNode[] {
		const queue = normalizeTaskPaths(startPaths).map((path) => ({ path, depth: 1 }));
		const visited = new Set<string>();
		const result: RelationshipTreeNode[] = [];

		while (queue.length > 0 && result.length < MAX_REL_TREE_NODES) {
			const current = queue.shift();
			if (!current || visited.has(current.path)) continue;
			visited.add(current.path);

			const linked = linkedTask(current.path);
			result.push({
				key: `${direction}:${current.path}`,
				path: current.path,
				label: taskLabelFromPath(current.path),
				depth: current.depth,
				direction,
				task: linked,
				isMissing: !linked,
				isBlocked: direction === 'upstream' && !!linked && !linked.is_complete,
			});

			if (!linked || current.depth >= MAX_REL_TREE_DEPTH) continue;

			const nextPaths = normalizeTaskPaths(direction === 'upstream' ? linked.depends_on : linked.blocks)
				.sort((a, b) => taskLabelFromPath(a).localeCompare(taskLabelFromPath(b)));
			for (const nextPath of nextPaths) {
				if (!visited.has(nextPath)) {
					queue.push({ path: nextPath, depth: current.depth + 1 });
				}
			}
		}

		return result;
	}

	function groupTreeLevels(nodes: RelationshipTreeNode[], descending: boolean): RelationshipTreeLevel[] {
		const grouped = new Map<number, RelationshipTreeNode[]>();
		for (const node of nodes) {
			const levelNodes = grouped.get(node.depth) ?? [];
			levelNodes.push(node);
			grouped.set(node.depth, levelNodes);
		}
		const depths = [...grouped.keys()].sort((a, b) => (descending ? b - a : a - b));
		return depths.map((depth) => ({
			depth,
			nodes: (grouped.get(depth) ?? []).sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path)),
		}));
	}

	// ── Reactive derived state ──────────────────────────────────────────────────

	$: dependencyTasks = task.depends_on.map((dep) => linkedTask(dep)).filter((dep): dep is Task => !!dep);
	$: missingDependencies = task.depends_on.filter((dep) => !linkedTask(dep));
	$: openDependencies = dependencyTasks.filter((dep) => !dep.is_complete);

	$: relationshipLayout = buildTaskGraph(tasks, {});
	$: relationshipNode = relationshipLayout.nodes.find((node) => node.path === task.path) ?? null;

	$: relationshipIssues = [
		...(relationshipNode?.isCycle ? ['Cycle detected for this task chain.'] : []),
		...(missingDependencies.length > 0 ? [`${missingDependencies.length} blocker link(s) missing from current task set.`] : []),
		...(openDependencies.length > 0 ? [`Blocked by ${openDependencies.length} unfinished task(s) — cannot start yet.`] : []),
	];

	$: upstreamTree = buildRelationshipTree(task.depends_on, 'upstream');
	$: downstreamTree = buildRelationshipTree(task.blocks, 'downstream');
	$: upstreamTreeLevels = groupTreeLevels(upstreamTree, true);
	$: downstreamTreeLevels = groupTreeLevels(downstreamTree, false);

	$: availableDependencies = tasks
		.filter((t) => t.type === 'task' && t.path !== task.path && !task.depends_on.some((d) => normalizeTaskPath(d) === t.path))
		.sort((a, b) => sortDependencyFirst(a, b, task.parent_task));

	const addBlockerFieldDefinition: FieldDefinition = {
		...(getFieldByName('depends_on') as FieldDefinition),
		label: '',
		chipsType: 'single',
		selectAllowEmpty: true,
	};

	function onAddDependencySelection(nextValue: string | string[]): void {
		if (typeof nextValue !== 'string' || !nextValue) return;
		void onAddDependency(nextValue);
	}
</script>

<hr class="tt-divider" />
<div class="tt-field-group">
	<span class="tt-label">System Fit</span>
	<div class="tt-rel-health">
		<div class="tt-rel-health-metrics">
			<span class="tt-rel-pill">⏸ Waiting on {task.depends_on.length}</span>
			<span class="tt-rel-pill">→ Unblocks {task.blocks.length}</span>
			{#if openDependencies.length > 0}
				<span class="tt-rel-pill tt-rel-pill-alert">Blocked by {openDependencies.length} open</span>
			{/if}
			{#if relationshipNode?.isCycle}
				<span class="tt-rel-pill tt-rel-pill-danger">Cycle</span>
			{/if}
		</div>
		<p class="tt-rel-help">
			<strong>Blocked by</strong> — must finish before this starts. &nbsp;
			<strong>Unblocks</strong> — completing this enables these tasks.
		</p>

		<div class="tt-rel-tree">
			{#if upstreamTreeLevels.length === 0 && downstreamTreeLevels.length === 0}
				<div class="tt-rel-empty">No linked tasks</div>
			{:else}
				<div class="tt-rel-tree-stack">
					{#each upstreamTreeLevels as level}
						<div class="tt-rel-tree-level" style={`--tt-tree-depth:${level.depth};`}>
							<span class="tt-rel-tree-label">↑ Blocked by</span>
							<div class="tt-chips">
								{#each level.nodes as node (node.key)}
									<button
										class="tt-chip tt-chip-rel tt-rel-tree-chip"
										class:tt-chip-warning={node.isMissing}
										class:tt-chip-blocking={node.isBlocked}
										on:click={() => openLinkedPath(node.path)}
										on:mouseenter={(event) => showLinkedHoverPreview(event, node.path)}
									>
										{node.label}
									</button>
								{/each}
							</div>
						</div>
					{/each}

					<div class="tt-rel-center tt-rel-center-selected">
						<span class="tt-rel-center-tag">Selected</span>
						<span class="tt-rel-center-name">{task.name}</span>
					</div>

					{#each downstreamTreeLevels as level}
						<div class="tt-rel-tree-level" style={`--tt-tree-depth:${level.depth};`}>
							<span class="tt-rel-tree-label">↓ Unblocks</span>
							<div class="tt-chips">
								{#each level.nodes as node (node.key)}
									<button
										class="tt-chip tt-chip-rel tt-rel-tree-chip"
										on:click={() => openLinkedPath(node.path)}
										on:mouseenter={(event) => showLinkedHoverPreview(event, node.path)}
									>
										{node.label}
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="tt-rel-editors">
			<div class="tt-rel-lane tt-rel-lane-full">
				<div class="tt-rel-heading">⏸ Blocked by</div>
				{#if task.depends_on.length === 0}
					<div class="tt-rel-empty">None</div>
				{:else}
					<div class="tt-chips">
						{#each task.depends_on as dep}
							<span class="tt-chip-group">
								<button
									class="tt-chip tt-chip-rel"
									class:tt-chip-warning={!linkedTask(dep)}
									class:tt-chip-blocking={!!linkedTask(dep) && !linkedTask(dep)?.is_complete}
									on:click={() => openLinkedPath(dep)}
									on:mouseenter={(event) => showLinkedHoverPreview(event, dep)}
								>
									{taskLabelFromPath(dep)}
								</button>
								<button
									class="tt-chip-remove"
									on:click|stopPropagation={() => onRemoveDependency(dep)}
									aria-label="Remove blocker"
									title="Remove blocker"
								>&times;</button>
							</span>
						{/each}
					</div>
				{/if}
				{#if availableDependencies.length > 0}
					<WikiLinkField
						definition={addBlockerFieldDefinition}
						value={null}
						options={availableDependencies}
						onChange={onAddDependencySelection}
					/>
				{/if}
			</div>

			<div class="tt-rel-lane tt-rel-lane-full">
				<div class="tt-rel-heading">→ Unblocks</div>
				{#if task.blocks.length === 0}
					<div class="tt-rel-empty">None</div>
				{:else}
					<div class="tt-chips">
						{#each task.blocks as dep}
							<button
								class="tt-chip tt-chip-rel"
								on:click={() => openLinkedPath(dep)}
								on:mouseenter={(event) => showLinkedHoverPreview(event, dep)}
							>
								{taskLabelFromPath(dep)}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		{#if relationshipIssues.length > 0}
			<div class="tt-rel-issues">
				{#each relationshipIssues as issue}
					<div class="tt-rel-issue">{issue}</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.tt-divider {
		border: none;
		border-top: 1px solid var(--background-modifier-border);
		margin: 0;
	}

	.tt-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.tt-field-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.tt-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.tt-chip {
		padding: var(--size-4-1, 4px) var(--size-4-3, 12px);
		border-radius: 999px;
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.12s;
	}

	.tt-chip:hover {
		border-color: var(--text-muted);
		color: var(--text-normal);
	}

	.tt-chip-rel {
		font-weight: 400;
		font-size: 0.78rem;
	}

	.tt-chip-warning {
		border-color: color-mix(in srgb, var(--color-orange) 48%, var(--background-modifier-border));
		background: color-mix(in srgb, var(--color-orange) 12%, var(--background-primary));
	}

	.tt-chip-blocking {
		border-color: color-mix(in srgb, var(--color-red) 45%, var(--background-modifier-border));
	}

	.tt-chip-group {
		display: inline-flex;
		align-items: stretch;
		gap: 0;
	}

	.tt-chip-group .tt-chip {
		border-top-right-radius: 0;
		border-bottom-right-radius: 0;
		border-right: none;
	}

	.tt-chip-remove {
		padding: 2px 7px;
		border-radius: 0 999px 999px 0;
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		border-left: none;
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-faint);
		font-size: 0.78rem;
		cursor: pointer;
		line-height: 1;
	}

	.tt-chip-remove:hover {
		background: color-mix(in srgb, var(--color-red) 12%, var(--background-primary));
		color: var(--color-red);
	}

	.tt-rel-health {
		display: flex;
		flex-direction: column;
		gap: 10px;
		max-height: 400px;
		overflow-y: auto;
	}

	.tt-rel-health-metrics {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.tt-rel-pill {
		display: inline-flex;
		align-items: center;
		padding: 3px 9px;
		border-radius: 999px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		background: var(--interactive-normal, var(--background-secondary));
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}

	.tt-rel-pill-alert {
		border-color: color-mix(in srgb, var(--color-orange) 42%, var(--background-modifier-border));
		color: var(--color-orange);
	}

	.tt-rel-pill-danger {
		border-color: color-mix(in srgb, var(--color-red) 42%, var(--background-modifier-border));
		color: var(--color-red);
	}

	.tt-rel-tree {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tt-rel-tree-stack {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.tt-rel-tree-level {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-left: calc((var(--tt-tree-depth, 1) - 1) * 14px + 10px);
	}

	.tt-rel-tree-level::before {
		content: '';
		position: absolute;
		left: calc((var(--tt-tree-depth, 1) - 1) * 14px + 2px);
		top: 2px;
		bottom: 2px;
		width: 1px;
		background: color-mix(in srgb, var(--interactive-accent) 30%, var(--background-modifier-border));
	}

	.tt-rel-tree-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-faint);
	}

	.tt-rel-tree-chip {
		justify-content: flex-start;
		text-align: left;
	}

	.tt-rel-editors {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.tt-rel-lane-full {
		min-width: 0;
		width: 100%;
	}

	.tt-rel-lane {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.tt-rel-help {
		font-size: 0.72rem;
		color: var(--text-faint);
		margin: 0;
		line-height: 1.5;
	}

	.tt-rel-help strong {
		color: var(--text-muted);
		font-weight: 600;
	}

	.tt-rel-heading {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-faint);
	}

	.tt-rel-empty {
		font-size: 0.78rem;
		color: var(--text-faint);
	}

	.tt-rel-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		padding: 6px 10px;
		border: 1px dashed var(--background-modifier-border);
		border-radius: var(--radius-m, 8px);
		min-width: 120px;
		background: var(--background-primary-alt, var(--background-secondary));
	}

	.tt-rel-center-selected {
		border-style: solid;
		border-color: color-mix(in srgb, var(--interactive-accent) 38%, var(--background-modifier-border));
	}

	.tt-rel-center-tag {
		font-size: 0.64rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-faint);
	}

	.tt-rel-center-name {
		font-size: 0.8rem;
		font-weight: 600;
		text-align: center;
		color: var(--text-normal);
	}

	.tt-rel-issues {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.tt-rel-issue {
		font-size: 0.78rem;
		padding: 6px 8px;
		border-left: 3px solid var(--color-orange);
		border-radius: var(--radius-s, 4px);
		background: color-mix(in srgb, var(--color-orange) 9%, var(--background-primary-alt, var(--background-secondary)));
		color: var(--text-muted);
	}

	@media (max-width: 700px) {
		.tt-rel-editors {
			grid-template-columns: 1fr;
		}

		.tt-rel-center {
			align-items: flex-start;
			text-align: left;
		}
	}
</style>
