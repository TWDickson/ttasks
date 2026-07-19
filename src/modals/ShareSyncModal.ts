import { Modal, Notice, type App } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { TaskJsonMode } from '../integration/taskJsonExport';
import { serializeTasksToJson } from '../integration/taskJsonExport';
import {
	type ExportFilterCriteria,
	EMPTY_EXPORT_CRITERIA,
	collectProjectFacets,
	filterTasksForExport,
} from '../integration/taskExportFilter';

/**
 * Share / Sync — filtered JSON export for feeding tasks to an external (file-less)
 * AI. Pick a mode (AI-clean vs full/round-trippable) and narrow by area / project
 * / status / label, then copy to the clipboard or save a file. The import half
 * (paste-back + bulk-edit summary) lands in a follow-up slice.
 */
export class ShareSyncModal extends Modal {
	private mode: TaskJsonMode = 'ai';
	private criteria: ExportFilterCriteria = { ...EMPTY_EXPORT_CRITERIA };
	private countEl: HTMLElement | null = null;

	constructor(app: App, private readonly plugin: TTasksPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass('tt-share-modal');
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Share / Sync' });
		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Export tasks as JSON to paste into an external tool. Narrow the set with the filters below, then copy or save.',
		});

		this.renderModeToggle(contentEl);
		this.renderFilters(contentEl);

		this.countEl = contentEl.createEl('p', { cls: 'tt-share-count' });

		const actions = contentEl.createDiv({ cls: 'modal-button-container' });
		actions.createEl('button', { text: 'Copy to clipboard', cls: 'mod-cta' })
			.addEventListener('click', () => void this.copy());
		actions.createEl('button', { text: 'Save .json file' })
			.addEventListener('click', () => void this.save());

		this.updateCount();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ── Rendering ────────────────────────────────────────────────────────────────

	private renderModeToggle(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: 'tt-share-mode' });
		row.createSpan({ cls: 'tt-label', text: 'Mode' });
		const group = row.createDiv({ cls: 'tt-share-mode-btns' });
		const options: Array<{ id: TaskJsonMode; label: string; title: string }> = [
			{ id: 'ai', label: 'AI-friendly', title: 'Clean, self-contained: names not vault paths, empty fields dropped.' },
			{ id: 'full', label: 'Full', title: 'Lossless: keeps ids/paths so it can round-trip back.' },
		];
		for (const opt of options) {
			const btn = group.createEl('button', { text: opt.label, cls: 'tt-btn tt-btn-sm', title: opt.title });
			btn.toggleClass('tt-btn-primary', this.mode === opt.id);
			btn.addEventListener('click', () => {
				this.mode = opt.id;
				group.querySelectorAll('button').forEach((b) => b.removeClass('tt-btn-primary'));
				btn.addClass('tt-btn-primary');
			});
		}
	}

	private renderFilters(parent: HTMLElement): void {
		const s = this.plugin.settings;
		const tasks = get(this.plugin.taskStore.tasks);

		this.renderChipGroup(parent, 'Areas', s.areas ?? [], this.criteria.areas);
		this.renderChipGroup(
			parent,
			'Projects',
			collectProjectFacets(tasks).map((p) => ({ value: p.path, label: p.name })),
			this.criteria.projects,
		);
		this.renderChipGroup(parent, 'Status', s.statuses ?? [], this.criteria.statuses);
		this.renderChipGroup(parent, 'Labels', s.labelValues ?? [], this.criteria.labels);

		const completedRow = parent.createDiv({ cls: 'tt-share-toggle-row' });
		const cb = completedRow.createEl('input', { type: 'checkbox' });
		cb.checked = this.criteria.includeCompleted;
		cb.id = 'tt-share-completed';
		completedRow.createEl('label', { text: 'Include completed tasks', attr: { for: 'tt-share-completed' } });
		cb.addEventListener('change', () => {
			this.criteria.includeCompleted = cb.checked;
			this.updateCount();
		});
	}

	/**
	 * A labelled row of toggle-chips. `values` are either bare strings (value ==
	 * label) or {value,label} pairs. Toggling a chip mutates `selected` in place.
	 */
	private renderChipGroup(
		parent: HTMLElement,
		label: string,
		values: Array<string | { value: string; label: string }>,
		selected: string[],
	): void {
		const normalized = values.map((v) => (typeof v === 'string' ? { value: v, label: v } : v));
		if (normalized.length === 0) return;

		const group = parent.createDiv({ cls: 'tt-share-group' });
		group.createSpan({ cls: 'tt-label', text: label });
		const chips = group.createDiv({ cls: 'tt-share-chips' });
		for (const { value, label: text } of normalized) {
			const chip = chips.createEl('button', { text, cls: 'tt-share-chip' });
			chip.toggleClass('is-selected', selected.includes(value));
			chip.addEventListener('click', () => {
				const idx = selected.indexOf(value);
				if (idx >= 0) selected.splice(idx, 1);
				else selected.push(value);
				chip.toggleClass('is-selected', selected.includes(value));
				this.updateCount();
			});
		}
	}

	// ── Actions ──────────────────────────────────────────────────────────────────

	private selectedTasks() {
		return filterTasksForExport(get(this.plugin.taskStore.tasks), this.criteria);
	}

	private updateCount(): void {
		if (!this.countEl) return;
		const total = get(this.plugin.taskStore.tasks).length;
		const n = this.selectedTasks().length;
		this.countEl.setText(`${n} of ${total} task${total === 1 ? '' : 's'} selected.`);
	}

	private async copy(): Promise<void> {
		const tasks = this.selectedTasks();
		if (tasks.length === 0) {
			new Notice('TTasks: no tasks match the current filters.');
			return;
		}
		const json = serializeTasksToJson(tasks, this.mode, new Date().toISOString());
		try {
			await navigator.clipboard.writeText(json);
			new Notice(`TTasks: copied ${tasks.length} task(s) to the clipboard.`);
			this.close();
		} catch {
			new Notice('TTasks: clipboard unavailable — use “Save .json file” instead.');
		}
	}

	private async save(): Promise<void> {
		const tasks = this.selectedTasks();
		if (tasks.length === 0) {
			new Notice('TTasks: no tasks match the current filters.');
			return;
		}
		await this.plugin.exportTasksToJsonFrom(tasks, this.mode);
		this.close();
	}
}
