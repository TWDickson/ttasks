<script lang="ts">
	import { Component, MarkdownRenderer } from 'obsidian';
	import { onDestroy, onMount } from 'svelte';
	import type TTasksPlugin from '../main';
	import type { Task } from '../types';
	import type { TaskStore } from '../store/TaskStore';

	export let task: Task;
	export let plugin: TTasksPlugin;
	export let store: TaskStore;

	let notesMode: 'preview' | 'edit' = 'preview';
	let notes = task.notes ?? '';
	let notesPreviewEl: HTMLDivElement | null = null;
	let markdownComponent: Component | null = null;
	let previewFrame: number | null = null;
	let previewRenderSeq = 0;
	let lastPreviewText = '';
	let pendingSaves = 0;
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	// Reset notes when task changes
	$: if (task) {
		notes = task.notes ?? '';
	}

	async function renderNotesPreview(markdown: string): Promise<void> {
		if (!notesPreviewEl || !markdownComponent) return;
		const renderSeq = ++previewRenderSeq;
		notesPreviewEl.innerHTML = '';
		const sourcePath = task.path;
		await MarkdownRenderer.render(plugin.app, markdown || '_No notes yet._', notesPreviewEl, sourcePath, markdownComponent);
		if (renderSeq !== previewRenderSeq) return;
	}

	function scheduleNotesPreview(markdown: string): void {
		if (previewFrame !== null) {
			cancelAnimationFrame(previewFrame);
			previewFrame = null;
		}
		previewFrame = requestAnimationFrame(() => {
			previewFrame = null;
			if (markdown === lastPreviewText) return;
			lastPreviewText = markdown;
			void renderNotesPreview(markdown);
		});
	}

	function saveNotesDebounced(nextNotes: string) {
		const taskPath = task.path;
		if (saveTimer) { clearTimeout(saveTimer); }
		saveTimer = setTimeout(async () => {
			saveTimer = null;
			pendingSaves += 1;
			try {
				const savedNotes = await store.updateNotes(taskPath, nextNotes);
				if (task?.path === taskPath) {
					notes = savedNotes;
				}
			} finally {
				pendingSaves = Math.max(0, pendingSaves - 1);
			}
		}, 600);
	}

	onMount(() => {
		markdownComponent = new Component();
		markdownComponent.load();
	});

	onDestroy(() => {
		markdownComponent?.unload();
		markdownComponent = null;
		if (saveTimer) { clearTimeout(saveTimer); }
		if (previewFrame !== null) {
			cancelAnimationFrame(previewFrame);
			previewFrame = null;
		}
	});

	$: if (notesPreviewEl && markdownComponent) {
		lastPreviewText = '';
		scheduleNotesPreview(notes);
	}
</script>

<hr class="tt-divider" />
<div class="tt-field-group">
	<div class="tt-notes-header">
		<span class="tt-label">Notes</span>
		<div class="tt-notes-toggle">
			<button type="button" class="tt-notes-tab" class:is-active={notesMode === 'preview'} on:click={() => notesMode = 'preview'}>Preview</button>
			<button type="button" class="tt-notes-tab" class:is-active={notesMode === 'edit'} on:click={() => notesMode = 'edit'}>Edit</button>
		</div>
	</div>
	{#if notesMode === 'edit'}
		<textarea
			id="tt-notes"
			class="tt-notes"
			bind:value={notes}
			on:input={() => saveNotesDebounced(notes)}
			placeholder="Add notes…"
			rows="8"
		></textarea>
	{:else}
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<div class="tt-notes-preview" bind:this={notesPreviewEl} on:click={() => notesMode = 'edit'} role="button" tabindex="0"></div>
	{/if}
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

	.tt-notes-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.tt-notes-toggle {
		display: flex;
		gap: 2px;
		background: var(--background-modifier-border);
		border-radius: calc(var(--button-radius, var(--radius-m, 8px)) - 2px);
		padding: 2px;
	}

	.tt-notes-tab {
		padding: 3px 10px;
		border: none;
		border-radius: var(--radius-s, 4px);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 600;
		cursor: pointer;
	}

	.tt-notes-tab.is-active {
		background: var(--background-primary);
		color: var(--text-normal);
	}

	.tt-notes {
		width: 100%;
		box-sizing: border-box;
		font-size: 0.88rem;
		padding: var(--size-4-2, 8px);
		border-radius: var(--input-radius, var(--radius-m, 8px));
		border: var(--input-border-width, var(--border-width, 1px)) solid var(--background-modifier-border);
		background: var(--background-modifier-form-field);
		color: var(--text-normal);
		resize: vertical;
		font-family: var(--font-text);
		min-height: 160px;
		caret-color: var(--caret-color, var(--interactive-accent));
	}

	.tt-notes:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.tt-notes-preview {
		padding: var(--size-4-3, 12px);
		min-height: 160px;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--input-radius, var(--radius-m, 8px));
		background: var(--background-primary-alt, var(--background-secondary));
		font-size: 0.88rem;
	}
</style>
