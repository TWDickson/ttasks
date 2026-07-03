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
	let notesTaskPath: string | null = task.path;
	let notesPreviewEl: HTMLDivElement | null = null;
	let markdownComponent: Component | null = null;
	let previewFrame: number | null = null;
	let previewRenderSeq = 0;
	let pendingSaves = 0;
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	// Reset notes ONLY when a different task is shown. The task prop object is
	// recreated on every store/vault event (including our own debounced save),
	// so resetting on any prop change clobbers text the user is typing.
	$: if (!task) {
		notesTaskPath = null;
	} else if (task.path !== notesTaskPath) {
		notesTaskPath = task.path;
		notes = task.notes ?? '';
		notesMode = 'preview';
	}

	async function renderNotesPreview(markdown: string): Promise<void> {
		if (!notesPreviewEl || !markdownComponent) return;
		const renderSeq = ++previewRenderSeq;
		const target = notesPreviewEl;
		if (!markdown.trim()) {
			// Plain styled placeholder — never fake markdown like '_No notes yet._'
			if (renderSeq === previewRenderSeq) {
				target.innerHTML = '';
				const empty = target.createDiv({ cls: 'tt-notes-empty' });
				empty.setText('No notes yet — click to add.');
			}
			return;
		}
		// Render into a scratch node first so a stale/interrupted render can
		// never leave the visible preview blank.
		const scratch = document.createElement('div');
		await MarkdownRenderer.render(plugin.app, markdown, scratch, task.path, markdownComponent);
		if (renderSeq !== previewRenderSeq || target !== notesPreviewEl || !target.isConnected) return;
		target.replaceChildren(...Array.from(scratch.childNodes));
	}

	function scheduleNotesPreview(markdown: string): void {
		if (previewFrame !== null) {
			cancelAnimationFrame(previewFrame);
			previewFrame = null;
		}
		previewFrame = requestAnimationFrame(() => {
			previewFrame = null;
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
				// Adopt the normalized saved text only if the user hasn't typed
				// more in the meantime — never overwrite in-progress edits.
				if (task?.path === taskPath && notes === nextNotes) {
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
	/* .tt-divider, .tt-label, .tt-field-group are plugin-global (styles.css). */

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
		max-height: 320px;
		overflow-y: auto;
		caret-color: var(--caret-color, var(--interactive-accent));
	}

	.tt-notes:focus {
		outline: none;
		border-color: var(--interactive-accent);
	}

	.tt-notes-preview {
		padding: var(--size-4-3, 12px);
		min-height: 160px;
		max-height: 320px;
		overflow-y: auto;
		border: var(--border-width, 1px) solid var(--background-modifier-border);
		border-radius: var(--input-radius, var(--radius-m, 8px));
		background: var(--background-primary-alt, var(--background-secondary));
		font-size: 0.88rem;
	}

	.tt-notes-preview :global(.tt-notes-empty) {
		color: var(--text-faint);
		font-style: italic;
	}
</style>
