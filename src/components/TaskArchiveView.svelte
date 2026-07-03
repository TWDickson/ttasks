<script lang="ts">
	import { onMount } from 'svelte';
	import type TTasksPlugin from '../main';
	import type { ArchivedTaskSummary } from '../store/ArchiveService';

	export let plugin: TTasksPlugin;

	const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'];

	let allTasks: ArchivedTaskSummary[] = [];
	let search = '';
	let loading = true;
	let restoring = new Set<string>();

	interface ArchiveGroup {
		key: string;      // e.g. '2026-05'
		label: string;    // e.g. 'May 2026'
		tasks: ArchivedTaskSummary[];
	}

	async function load() {
		loading = true;
		allTasks = await plugin.archiveService.loadArchivedTasks();
		loading = false;
	}

	onMount(() => { void load(); });

	function monthLabel(year: string, month: string): string {
		const idx = parseInt(month, 10) - 1;
		const name = MONTH_NAMES[idx] ?? month;
		return `${name} ${year}`;
	}

	$: filtered = search.trim()
		? allTasks.filter(t => t.name.toLowerCase().includes(search.trim().toLowerCase()))
		: allTasks;

	$: groups = (() => {
		const map = new Map<string, ArchivedTaskSummary[]>();
		for (const task of filtered) {
			const key = `${task.archiveYear}-${task.archiveMonth.padStart(2, '0')}`;
			const group = map.get(key) ?? [];
			group.push(task);
			map.set(key, group);
		}
		const result: ArchiveGroup[] = [];
		for (const [key, tasks] of map.entries()) {
			const [year, month] = key.split('-');
			result.push({ key, label: monthLabel(year, month ?? ''), tasks });
		}
		return result.sort((a, b) => b.key.localeCompare(a.key));
	})();

	async function restore(path: string) {
		restoring = new Set([...restoring, path]);
		try {
			await plugin.archiveService.restoreTask(path);
			await load();
		} finally {
			restoring = new Set([...restoring].filter(p => p !== path));
		}
	}

	function formatDate(date: string | null): string {
		if (!date) return '—';
		return date;
	}
</script>

<div class="tt-archive">
	<div class="tt-archive-toolbar">
		<input
			class="tt-archive-search"
			type="text"
			placeholder="Search archive…"
			bind:value={search}
		/>
		<span class="tt-archive-count">
			{#if loading}Loading…{:else}{filtered.length} task{filtered.length === 1 ? '' : 's'}{/if}
		</span>
	</div>

	{#if loading}
		<div class="tt-archive-empty">Loading archive…</div>
	{:else if groups.length === 0}
		<div class="tt-archive-empty">
			{search ? 'No archived tasks match your search.' : 'No archived tasks yet.'}
		</div>
	{:else}
		{#each groups as group (group.key)}
			<section class="tt-archive-group">
				<h3 class="tt-group-heading tt-archive-group-heading">
					{group.label}
					<span class="tt-count">{group.tasks.length}</span>
				</h3>
				<ul class="tt-archive-list">
					{#each group.tasks as task (task.path)}
						<li class="tt-archive-item">
							<div class="tt-archive-item-name">{task.name}</div>
							<div class="tt-archive-item-meta">
								{#if task.area}<span class="tt-archive-area">{task.area}</span>{/if}
								<span class="tt-archive-date" title="Completion date">
									{formatDate(task.completed)}
								</span>
							</div>
							<button
								class="tt-btn tt-btn-sm tt-archive-restore"
								disabled={restoring.has(task.path)}
								on:click={() => restore(task.path)}
							>
								{restoring.has(task.path) ? '…' : 'Restore'}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>

<style>
	.tt-archive {
		display: flex;
		flex-direction: column;
		gap: var(--size-4-3, 12px);
		padding: var(--size-4-4, 16px);
		max-width: 660px;
		overflow-y: auto;
		flex: 1;
	}

	.tt-archive-toolbar {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.tt-archive-search {
		flex: 1;
		font-size: 0.88rem;
		padding: var(--size-2-3, 6px) var(--size-4-2, 8px);
		border-radius: var(--input-radius, var(--radius-m, 8px));
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		background: var(--background-modifier-form-field);
		color: var(--text-normal);
	}

	.tt-archive-search:focus {
		outline: none;
		border-color: var(--background-modifier-border-focus);
	}

	.tt-archive-count {
		font-size: 0.75rem;
		color: var(--text-faint);
		white-space: nowrap;
	}

	.tt-archive-empty {
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: var(--size-4-8, 32px) 0;
	}

	.tt-archive-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	/* Base heading/count visuals come from the global .tt-group-heading/.tt-count. */
	.tt-archive-group-heading {
		padding: 0 0 4px 0;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.tt-archive-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.tt-archive-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px;
		border-radius: var(--radius-s, 4px);
		background: var(--background-primary-alt, var(--background-secondary));
		min-height: 38px;
	}

	.tt-archive-item:hover {
		background: var(--background-modifier-hover);
	}

	.tt-archive-item-name {
		flex: 1;
		min-width: 0;
		font-size: 0.88rem;
		color: var(--text-normal);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tt-archive-item-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.tt-archive-area {
		font-size: 0.72rem;
		color: var(--text-faint);
		background: var(--background-modifier-border);
		padding: 1px 6px;
		border-radius: 999px;
	}

	.tt-archive-date {
		font-size: 0.75rem;
		color: var(--text-faint);
		min-width: 80px;
		text-align: right;
	}

	/* Restore button uses the global .tt-btn .tt-btn-sm system. */
	.tt-archive-restore {
		flex-shrink: 0;
	}
</style>
