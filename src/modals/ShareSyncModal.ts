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
import { parseTasksJson } from '../integration/taskJsonImport';
import { type ImportPlan, planImport, summarizeImportPlan } from '../integration/taskImportPlan';

type ShareTab = 'export' | 'import';

/**
 * Share / Sync — the round-trip surface for feeding tasks to an external
 * (file-less) AI. Export: pick a mode + narrow by area/project/status/label, then
 * copy or save. Import: paste an (edited) document, preview the bulk-edit summary,
 * then apply it to the vault.
 */
export class ShareSyncModal extends Modal {
	private tab: ShareTab = 'export';
	private mode: TaskJsonMode = 'ai';
	private criteria: ExportFilterCriteria = { ...EMPTY_EXPORT_CRITERIA };

	private bodyEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;

	// Import state
	private importText = '';
	private importPlan: ImportPlan | null = null;

	constructor(app: App, private readonly plugin: TTasksPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass('tt-share-modal');
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Share / Sync' });
		this.renderTabs(contentEl);
		this.bodyEl = contentEl.createDiv({ cls: 'tt-share-body' });
		this.renderActiveTab();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ── Tabs ─────────────────────────────────────────────────────────────────────

	private renderTabs(parent: HTMLElement): void {
		const bar = parent.createDiv({ cls: 'tt-share-tabs' });
		const tabs: Array<{ id: ShareTab; label: string }> = [
			{ id: 'export', label: 'Export' },
			{ id: 'import', label: 'Import' },
		];
		for (const t of tabs) {
			const btn = bar.createEl('button', { text: t.label, cls: 'tt-share-tab' });
			btn.toggleClass('is-active', this.tab === t.id);
			btn.addEventListener('click', () => {
				this.tab = t.id;
				bar.querySelectorAll('button').forEach((b) => b.removeClass('is-active'));
				btn.addClass('is-active');
				this.renderActiveTab();
			});
		}
	}

	private renderActiveTab(): void {
		if (!this.bodyEl) return;
		this.bodyEl.empty();
		if (this.tab === 'export') this.renderExport(this.bodyEl);
		else this.renderImport(this.bodyEl);
	}

	// ── Export ───────────────────────────────────────────────────────────────────

	private renderExport(parent: HTMLElement): void {
		parent.createEl('p', {
			cls: 'setting-item-description',
			text: 'Export tasks as JSON to paste into an external tool. Narrow the set with the filters below, then copy or save.',
		});

		this.renderModeToggle(parent);

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

		this.countEl = parent.createEl('p', { cls: 'tt-share-count' });

		const actions = parent.createDiv({ cls: 'modal-button-container' });
		actions.createEl('button', { text: 'Copy to clipboard', cls: 'mod-cta' })
			.addEventListener('click', () => void this.copy());
		actions.createEl('button', { text: 'Save .json file' })
			.addEventListener('click', () => void this.save());

		this.updateCount();
	}

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

	// ── Import ───────────────────────────────────────────────────────────────────

	private renderImport(parent: HTMLElement): void {
		parent.createEl('p', {
			cls: 'setting-item-description',
			text: 'Paste an exported (or AI-edited) document. Preview the changes, then apply — matched by task name; new tasks are created. Relationships and note bodies are not imported.',
		});

		const textarea = parent.createEl('textarea', { cls: 'tt-share-import-text' });
		textarea.placeholder = 'Paste task JSON here…';
		textarea.value = this.importText;
		textarea.rows = 8;

		const summaryEl = parent.createDiv({ cls: 'tt-share-summary' });

		const actions = parent.createDiv({ cls: 'modal-button-container' });
		const previewBtn = actions.createEl('button', { text: 'Preview changes' });
		const applyBtn = actions.createEl('button', { text: 'Apply', cls: 'mod-cta' });
		applyBtn.disabled = true;

		const renderSummary = () => {
			summaryEl.empty();
			this.importPlan = null;
			applyBtn.disabled = true;

			const text = textarea.value.trim();
			if (text === '') {
				summaryEl.createEl('p', { cls: 'setting-item-description', text: 'Nothing pasted yet.' });
				return;
			}
			const parsed = parseTasksJson(text);
			if (!parsed.ok) {
				const box = summaryEl.createDiv({ cls: 'tt-share-errors' });
				for (const err of parsed.errors) box.createEl('div', { text: `⚠ ${err}` });
				return;
			}
			const plan = planImport(parsed.tasks, get(this.plugin.taskStore.tasks));
			this.importPlan = plan;

			const list = summaryEl.createEl('ul', { cls: 'tt-share-summary-list' });
			for (const line of summarizeImportPlan(plan)) list.createEl('li', { text: line });
			for (const warn of parsed.warnings) list.createEl('li', { cls: 'tt-share-warn', text: `⚠ ${warn}` });

			applyBtn.disabled = plan.creates.length === 0 && plan.updates.length === 0;
		};

		textarea.addEventListener('input', () => {
			this.importText = textarea.value;
		});
		previewBtn.addEventListener('click', renderSummary);
		applyBtn.addEventListener('click', () => void this.applyImport());

		if (this.importText.trim() !== '') renderSummary();
	}

	private async applyImport(): Promise<void> {
		if (!this.importPlan) return;
		const plan = this.importPlan;
		const { created, updated } = await this.plugin.applyImportPlan(plan);
		new Notice(`TTasks: imported — ${created} created, ${updated} updated.`);
		this.close();
	}
}
