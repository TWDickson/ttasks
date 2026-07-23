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
import {
	type ShareOutputBlock,
	type ShareOutputFormat,
	type SharePreamblePresetId,
	SHARE_PREAMBLE_PRESETS,
	buildPreambleText,
	composeShareOutput,
	findPreamblePreset,
} from '../integration/sharePreamble';

type ShareTab = 'export' | 'import';

/**
 * Share / Sync — the round-trip surface for feeding tasks to an external
 * (file-less) AI. Export: pick a mode + narrow by area/project/status/label, then
 * copy or save. Import: paste an (edited) document, preview the bulk-edit summary,
 * then apply it to the vault.
 */
export class ShareSyncModal extends Modal {
	private tab: ShareTab = 'export';
	private mode: TaskJsonMode;
	private criteria: ExportFilterCriteria;
	private outputFormat: ShareOutputFormat;
	private preamblePreset: SharePreamblePresetId;
	/** Live preamble text; seeded from the preset and editable in place. */
	private preambleText: string;

	private bodyEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private outputEl: HTMLElement | null = null;

	// Import state
	private importText = '';
	private importPlan: ImportPlan | null = null;
	// All categories are accepted by default; uncheck to deny. Destructive ones
	// (deletions, link removals, note-body replacements) are still flagged so they
	// don't apply unnoticed.
	private applyCreates = true;
	private applyUpdates = true;
	private applyDeletes = true;
	private applyLinks = true;
	private applyLinkRemovals = true;
	private applyParents = true;
	private applyNotes = true;

	constructor(app: App, private readonly plugin: TTasksPlugin) {
		super(app);
		// Reopen where the last share left off (settings.shareSync).
		const remembered = plugin.settings.shareSync;
		this.mode = remembered.mode;
		this.outputFormat = remembered.outputFormat;
		this.preamblePreset = remembered.preamblePreset;
		this.criteria = {
			areas: [...remembered.areas],
			projects: [...remembered.projects],
			statuses: [...remembered.statuses],
			labels: [...remembered.labels],
			includeCompleted: remembered.includeCompleted,
		};
		this.preambleText = remembered.customPreamble.trim() !== ''
			? remembered.customPreamble
			: buildPreambleText(findPreamblePreset(this.preamblePreset), plugin.taskJsonValidValues());
	}

	/**
	 * Persist the export tab's current state. Fire-and-forget on every change so a
	 * mid-session close still remembers; `customPreamble` is only stored when it
	 * differs from the preset's generated text, so preset edits (or a change to the
	 * vault's statuses) still refresh the default wording on next open.
	 */
	private rememberExportState(): void {
		const generated = buildPreambleText(findPreamblePreset(this.preamblePreset), this.plugin.taskJsonValidValues());
		this.plugin.settings.shareSync = {
			mode: this.mode,
			outputFormat: this.outputFormat,
			preamblePreset: this.preamblePreset,
			customPreamble: this.preambleText === generated ? '' : this.preambleText,
			areas: [...this.criteria.areas],
			projects: [...this.criteria.projects],
			statuses: [...this.criteria.statuses],
			labels: [...this.criteria.labels],
			includeCompleted: this.criteria.includeCompleted,
		};
		void this.plugin.saveSettings();
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
			this.rememberExportState();
		});

		this.countEl = parent.createEl('p', { cls: 'tt-share-count' });

		// The message + packaging controls only apply to an AI-bound export; a
		// 'full' export is a machine round-trip file with no chat on the other end.
		if (this.mode === 'ai') this.renderPreamble(parent);
		this.renderOutputFormat(parent);

		this.outputEl = parent.createDiv({ cls: 'modal-button-container' });
		this.renderOutputActions();

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
				if (this.mode === opt.id) return;
				this.mode = opt.id;
				this.rememberExportState();
				// Re-render: the message controls appear/disappear with the mode.
				this.renderActiveTab();
			});
		}
	}

	/**
	 * The framing message that goes in front of the JSON. A preset seeds the
	 * textarea; editing it in place is what actually gets copied, so the presets
	 * are a starting point rather than a fixed set.
	 */
	private renderPreamble(parent: HTMLElement): void {
		const group = parent.createDiv({ cls: 'tt-share-group tt-share-preamble' });
		const head = group.createDiv({ cls: 'tt-share-preamble-head' });
		head.createSpan({ cls: 'tt-label', text: 'Message' });

		const select = head.createEl('select', { cls: 'dropdown tt-share-preamble-select' });
		for (const preset of SHARE_PREAMBLE_PRESETS) {
			select.createEl('option', { text: preset.label, value: preset.id });
		}
		select.value = this.preamblePreset;

		const textarea = group.createEl('textarea', { cls: 'tt-share-preamble-text' });
		textarea.rows = 5;
		textarea.value = this.preambleText;
		textarea.placeholder = 'Message to put in front of the JSON…';

		select.addEventListener('change', () => {
			this.preamblePreset = select.value as SharePreamblePresetId;
			// Switching preset replaces the text — the edited copy belonged to the
			// preset that was selected, so carrying it over would be misleading.
			this.preambleText = buildPreambleText(
				findPreamblePreset(this.preamblePreset),
				this.plugin.taskJsonValidValues(),
			);
			textarea.value = this.preambleText;
			this.rememberExportState();
			this.renderOutputActions();
		});
		textarea.addEventListener('input', () => {
			this.preambleText = textarea.value;
			this.rememberExportState();
			this.renderOutputActions();
		});
	}

	/** How the message and the JSON are packaged for copying. */
	private renderOutputFormat(parent: HTMLElement): void {
		const row = parent.createDiv({ cls: 'tt-share-mode' });
		row.createSpan({ cls: 'tt-label', text: 'Copy as' });
		const group = row.createDiv({ cls: 'tt-share-mode-btns' });
		const options: Array<{ id: ShareOutputFormat; label: string; title: string }> = [
			{ id: 'fenced', label: 'One block', title: 'Message then the JSON in a ```json fence — a single paste.' },
			{ id: 'separate', label: 'Two fields', title: 'Message and JSON copied separately — for tools that take the data as its own paste or attachment.' },
			{ id: 'json-only', label: 'JSON only', title: 'No message, just the JSON.' },
		];
		for (const opt of options) {
			const btn = group.createEl('button', { text: opt.label, cls: 'tt-btn tt-btn-sm', title: opt.title });
			btn.toggleClass('tt-btn-primary', this.outputFormat === opt.id);
			btn.addEventListener('click', () => {
				this.outputFormat = opt.id;
				group.querySelectorAll('button').forEach((b) => b.removeClass('tt-btn-primary'));
				btn.addClass('tt-btn-primary');
				this.rememberExportState();
				this.renderOutputActions();
			});
		}
	}

	/** One Copy button per composed block, plus the always-present file export. */
	private renderOutputActions(): void {
		const actions = this.outputEl;
		if (!actions) return;
		actions.empty();

		const blocks = this.composeBlocks('');
		blocks.forEach((block, index) => {
			const btn = actions.createEl('button', { text: block.copyLabel });
			// Highlight the first copy button as the primary action.
			if (index === 0) btn.addClass('mod-cta');
			btn.addEventListener('click', () => void this.copyBlock(index));
		});

		actions.createEl('button', { text: 'Save .json file', title: 'Write a .json file to the vault root — use this when the tool wants an attachment.' })
			.addEventListener('click', () => void this.save());
	}

	/** Compose the current output blocks around a given JSON payload. */
	private composeBlocks(json: string): ShareOutputBlock[] {
		const preamble = this.mode === 'ai' ? this.preambleText : '';
		return composeShareOutput(preamble, json, this.outputFormat);
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
				this.rememberExportState();
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

	private async copyBlock(index: number): Promise<void> {
		const tasks = this.selectedTasks();
		if (tasks.length === 0) {
			new Notice('TTasks: no tasks match the current filters.');
			return;
		}
		const json = serializeTasksToJson(tasks, this.mode, new Date().toISOString(), this.plugin.taskJsonValidValues());
		const blocks = this.composeBlocks(json);
		const block = blocks[index];
		if (!block) return;
		try {
			await navigator.clipboard.writeText(block.text);
			const what = block.label === '' ? `${tasks.length} task(s)` : `the ${block.label.toLowerCase()}`;
			new Notice(`TTasks: copied ${what} to the clipboard.`);
			// With two separate fields the user still needs the other one, so only
			// a single-block copy is "done".
			if (blocks.length === 1) this.close();
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
			text: 'Paste an exported (or AI-edited) document. Preview the changes, then apply — all categories are applied by default; uncheck any to skip it. Matched by ref, else by type + task name (projects only ever match projects). An entry can carry an "action" ("create" / "delete"); with none it updates the matched task, or creates it if new — add "type": "project" to create a project. Dependency links (depends_on) are added; list tasks under "remove_depends_on" to unlink. Set a project with "parent" or detach with "remove_parent". A "notes" value replaces the whole note body; omit it to leave the body alone.',
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

			const refreshApply = () => {
				applyBtn.disabled = !(
					(this.applyUpdates && plan.updates.length > 0) ||
					(this.applyCreates && plan.creates.length > 0) ||
					(this.applyDeletes && plan.deletes.length > 0) ||
					(this.applyLinks && plan.linkAdds.length > 0) ||
					(this.applyLinkRemovals && plan.linkRemovals.length > 0) ||
					(this.applyParents && plan.parentChanges.length > 0) ||
					(this.applyNotes && plan.notesChanges.length > 0)
				);
			};

			const toggles = summaryEl.createDiv({ cls: 'tt-share-apply-toggles' });
			const addToggle = (
				label: string,
				count: number,
				checked: boolean,
				onChange: (value: boolean) => void,
				destructive = false,
			): void => {
				if (count === 0) return;
				const row = toggles.createDiv({ cls: 'tt-share-toggle-row' });
				row.toggleClass('is-destructive', destructive);
				const cb = row.createEl('input', { type: 'checkbox' });
				cb.checked = checked;
				const id = `tt-share-apply-${label.replace(/\s+/g, '-').toLowerCase()}`;
				cb.id = id;
				row.createEl('label', { text: `${label} (${count})`, attr: { for: id } });
				cb.addEventListener('change', () => {
					onChange(cb.checked);
					refreshApply();
				});
			};
			addToggle('Apply updates', plan.updates.length, this.applyUpdates, (v) => (this.applyUpdates = v));
			addToggle('Apply new tasks', plan.creates.length, this.applyCreates, (v) => (this.applyCreates = v));
			addToggle('Apply links', plan.linkAdds.length, this.applyLinks, (v) => (this.applyLinks = v));
			addToggle('Apply link removals', plan.linkRemovals.length, this.applyLinkRemovals, (v) => (this.applyLinkRemovals = v), true);
			addToggle('Apply parent changes', plan.parentChanges.length, this.applyParents, (v) => (this.applyParents = v));
			addToggle('Replace note bodies', plan.notesChanges.length, this.applyNotes, (v) => (this.applyNotes = v), true);
			addToggle('Apply deletions', plan.deletes.length, this.applyDeletes, (v) => (this.applyDeletes = v), true);

			refreshApply();
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
		const { created, updated, deleted, linked, unlinked, reparented, renoted } = await this.plugin.applyImportPlan(plan, {
			creates: this.applyCreates,
			updates: this.applyUpdates,
			deletes: this.applyDeletes,
			links: this.applyLinks,
			linkRemovals: this.applyLinkRemovals,
			parents: this.applyParents,
			notes: this.applyNotes,
		});
		const parts = [`${created} created`, `${updated} updated`];
		if (deleted > 0) parts.push(`${deleted} deleted`);
		if (linked > 0) parts.push(`${linked} linked`);
		if (unlinked > 0) parts.push(`${unlinked} unlinked`);
		if (reparented > 0) parts.push(`${reparented} reparented`);
		if (renoted > 0) parts.push(`${renoted} note bodies replaced`);
		new Notice(`TTasks: imported — ${parts.join(', ')}.`);
		this.close();
	}
}
