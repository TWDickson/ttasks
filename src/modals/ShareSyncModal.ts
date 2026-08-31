import { Component, MarkdownRenderer, Modal, Notice, setIcon, type App } from 'obsidian';
import { get } from 'svelte/store';
import { localDateString } from '../utils/dateUtils';
import type TTasksPlugin from '../main';
import type { NotesPolicy, TaskJsonMode } from '../integration/taskJsonExport';
import { serializeTasksToJson } from '../integration/taskJsonExport';
import { serializeTasksToToon } from '../integration/taskToonExport';
import {
	type ExportFilterCriteria,
	collectProjectFacets,
	filterTasksForExport,
} from '../integration/taskExportFilter';
import type { Task } from '../types';
import { parseTasksJson } from '../integration/taskJsonImport';
import {
	type ImportPlan,
	type ImportPlanEntry,
	type ImportEntryKind,
	filterImportPlan,
	importPlanEntries,
	isEmptyImportPlan,
	planImport,
	summarizeImportPlan,
} from '../integration/taskImportPlan';
import {
	type ShareOutputBlock,
	type ShareOutputFormat,
	type SharePayloadFormat,
	type SharePreamblePreset,
	type SharePreamblePresetId,
	buildPreambleText,
	composeShareOutput,
	findPresetIn,
} from '../integration/sharePreamble';

type ShareTab = 'export' | 'import';

/** Section headings for the per-item review list, in apply order. */
const ENTRY_GROUPS: Array<{ kind: ImportEntryKind; label: string }> = [
	{ kind: 'update', label: 'Field updates' },
	{ kind: 'notes', label: 'Note bodies' },
	{ kind: 'create', label: 'New tasks' },
	{ kind: 'link', label: 'Dependency links' },
	{ kind: 'unlink', label: 'Links removed' },
	{ kind: 'parent', label: 'Project moves' },
	{ kind: 'delete', label: 'Deletions' },
];

/**
 * Share / Sync — the round-trip surface for feeding tasks to an external
 * (file-less) AI. Export: pick a mode + narrow by area/project/status/label, then
 * copy or save. Import: paste an (edited) document, review the changes item by
 * item, reject any you don't want, then apply the rest to the vault.
 */
/**
 * Completed-work windows. Old finished work is dead weight in an AI export — it
 * costs tokens and drags the model's attention onto things that are already
 * done — so this trims it by completion date without dropping history entirely.
 */
const COMPLETED_WINDOWS: Array<{ label: string; days: number | null }> = [
	{ label: 'all time', days: null },
	{ label: 'last 7 days', days: 7 },
	{ label: 'last 30 days', days: 30 },
	{ label: 'last 90 days', days: 90 },
];

export class ShareSyncModal extends Modal {
	private tab: ShareTab = 'export';
	private mode: TaskJsonMode;
	private criteria: ExportFilterCriteria;
	private outputFormat: ShareOutputFormat;
	private payloadFormat: SharePayloadFormat;
	private notesPolicy: NotesPolicy;
	private preamblePreset: SharePreamblePresetId;
	/** Live preamble text; seeded from the preset and editable in place. */
	private preambleText: string;

	private bodyEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private outputEl: HTMLElement | null = null;

	// Import state
	private importText = '';
	private importPlan: ImportPlan | null = null;
	/** Entries the user rejected in the review list — dropped before applying. */
	private rejectedKeys = new Set<string>();
	/** Re-renders the import preview from the pasted text; set while the tab is mounted. */
	private renderPreview: (() => void) | null = null;
	/** Recomputes the totals + Apply button state; set alongside a live preview. */
	private refreshApplyState: (() => void) | null = null;
	/** Per-category label updaters, refreshed whenever the effective plan changes. */
	private toggleCountUpdaters: Array<(plan: ImportPlan) => void> = [];
	// All categories are accepted by default; uncheck to deny. Destructive ones
	// (deletions, link removals, note-body replacements) are still flagged so they
	// don't apply unnoticed.
	private applyToggles = {
		creates: true,
		updates: true,
		deletes: true,
		links: true,
		linkRemovals: true,
		parents: true,
		notes: true,
	};

	/**
	 * Owns the lifecycle of markdown rendered into the note-body previews.
	 * `Modal` isn't a `Component`, so MarkdownRenderer needs one of its own —
	 * unloaded on close so embedded children don't outlive the modal.
	 */
	private readonly renderHost = new Component();

	constructor(app: App, private readonly plugin: TTasksPlugin) {
		super(app);
		// Reopen where the last share left off (settings.shareSync).
		const remembered = plugin.settings.shareSync;
		this.mode = remembered.mode;
		this.outputFormat = remembered.outputFormat;
		this.payloadFormat = remembered.payloadFormat;
		this.notesPolicy = remembered.notesPolicy;
		this.preamblePreset = remembered.preamblePreset;
		this.criteria = {
			areas: [...remembered.areas],
			projects: [...remembered.projects],
			statuses: [...remembered.statuses],
			labels: [...remembered.labels],
			includeCompleted: remembered.includeCompleted,
			completedWithinDays: remembered.completedWithinDays,
		};
		this.preambleText = remembered.customPreamble.trim() !== ''
			? remembered.customPreamble
			: this.generatedPreamble();
	}

	/** The preamble the current settings would produce, unedited. */
	private generatedPreamble(): string {
		return buildPreambleText(findPresetIn(this.presetLibrary(), this.preamblePreset), this.plugin.taskJsonValidValues(), {
			payloadFormat: this.payloadFormat,
			notesPolicy: this.notesPolicy,
		});
	}

	/** The live, user-tunable prompt library (settings-owned). */
	private presetLibrary(): SharePreamblePreset[] {
		return this.plugin.settings.shareSync.preamblePresets;
	}

	/**
	 * Persist the export tab's current state. Fire-and-forget on every change so a
	 * mid-session close still remembers; `customPreamble` is only stored when it
	 * differs from the preset's generated text, so preset edits (or a change to the
	 * vault's statuses, format, or notes policy) still refresh the default wording.
	 */
	private rememberExportState(): void {
		this.plugin.settings.shareSync = {
			mode: this.mode,
			outputFormat: this.outputFormat,
			payloadFormat: this.payloadFormat,
			notesPolicy: this.notesPolicy,
			preamblePreset: this.preamblePreset,
			customPreamble: this.preambleText === this.generatedPreamble() ? '' : this.preambleText,
			// The library is owned by the settings tab, not this modal — carry it
			// through untouched rather than dropping it on every export tweak.
			preamblePresets: this.plugin.settings.shareSync.preamblePresets,
			areas: [...this.criteria.areas],
			projects: [...this.criteria.projects],
			statuses: [...this.criteria.statuses],
			labels: [...this.criteria.labels],
			includeCompleted: this.criteria.includeCompleted,
			completedWithinDays: this.criteria.completedWithinDays,
		};
		void this.plugin.saveSettings();
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass('tt-share-modal');
		contentEl.empty();
		this.renderHost.load();

		contentEl.createEl('h2', { text: 'Share / Sync' });
		this.renderTabs(contentEl);
		this.bodyEl = contentEl.createDiv({ cls: 'tt-share-body' });
		this.renderActiveTab();
	}

	onClose(): void {
		this.renderHost.unload();
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
			text: 'Export tasks to paste into an external tool. Narrow the set with the filters below, then copy or save.',
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
		// The window only means anything while completed work is included, so it
		// enables and disables with the checkbox rather than sitting there inert.
		const windowSelect = completedRow.createEl('select', { cls: 'dropdown tt-share-completed-window' });
		for (const option of COMPLETED_WINDOWS) {
			windowSelect.createEl('option', { text: option.label, value: String(option.days ?? '') });
		}
		windowSelect.value = String(this.criteria.completedWithinDays ?? '');
		windowSelect.disabled = !this.criteria.includeCompleted;
		windowSelect.addEventListener('change', () => {
			const raw = windowSelect.value;
			this.criteria.completedWithinDays = raw === '' ? null : Number(raw);
			this.updateCount();
			this.rememberExportState();
		});

		cb.addEventListener('change', () => {
			this.criteria.includeCompleted = cb.checked;
			windowSelect.disabled = !cb.checked;
			this.updateCount();
			this.rememberExportState();
		});

		this.countEl = parent.createEl('p', { cls: 'tt-share-count' });

		// Payload shape + message controls only apply to an AI-bound export; a
		// 'full' export is a machine round-trip file with no chat on the other end.
		if (this.mode === 'ai') {
			this.renderNotesPolicy(parent);
			this.renderPayloadFormat(parent);
			this.renderPreamble(parent);
		}
		this.renderOutputFormat(parent);

		this.outputEl = parent.createDiv({ cls: 'modal-button-container' });
		this.renderOutputActions();

		this.updateCount();
	}

	private renderModeToggle(parent: HTMLElement): void {
		this.renderSegmented(parent, 'Mode', [
			{ id: 'ai', label: 'AI-friendly', title: 'Clean, self-contained: names not vault paths, empty fields dropped.' },
			{ id: 'full', label: 'Full', title: 'Lossless: keeps ids/paths so it can round-trip back.' },
		], this.mode, (id) => {
			if (this.mode === id) return;
			this.mode = id;
			this.rememberExportState();
			// Re-render: the payload/message controls appear/disappear with the mode.
			this.renderActiveTab();
		});
	}

	/**
	 * How much of each note body goes out. Measured on a real 100-task export the
	 * bodies were 62% of the tokens — more than every other choice here combined —
	 * so this control is the one that actually decides how big a share is.
	 */
	private renderNotesPolicy(parent: HTMLElement): void {
		this.renderSegmented(parent, 'Note bodies', [
			{ id: 'full', label: 'Full', title: 'Send every note body in full. Largest, and the only setting where the AI can propose body edits.' },
			{ id: 'summary', label: 'First 200 chars', title: 'Send the opening of each body for context. Roughly a quarter the size.' },
			{ id: 'none', label: 'Omit', title: 'Task fields only — about a third the size of a full export.' },
		], this.notesPolicy, (id) => {
			if (this.notesPolicy === id) return;
			this.withPreambleSync(() => { this.notesPolicy = id; });
			this.rememberExportState();
			this.renderActiveTab();
		});
	}

	/** JSON (round-trips) vs TOON (denser, export-only). */
	private renderPayloadFormat(parent: HTMLElement): void {
		this.renderSegmented(parent, 'Data format', [
			{ id: 'json', label: 'JSON', title: 'The standard shape. Use this if the tool on the other end might send data back.' },
			{ id: 'toon', label: 'TOON', title: 'A compact table — about 18% fewer tokens than JSON. Export only; replies still come back as JSON.' },
		], this.payloadFormat, (id) => {
			if (this.payloadFormat === id) return;
			this.withPreambleSync(() => { this.payloadFormat = id; });
			this.rememberExportState();
			this.renderActiveTab();
		});
	}

	/**
	 * Apply a change that the preamble wording depends on, keeping an untouched
	 * message in step with it — the text carries format- and notes-specific
	 * warnings. Whether the message counts as "untouched" has to be decided
	 * BEFORE the setting moves, since the comparison is against what the old
	 * setting would have generated. An edited message is left alone; silently
	 * rewriting the user's own words would be worse than a stale sentence.
	 */
	private withPreambleSync(mutate: () => void): void {
		const wasGenerated = this.preambleText === '' || this.preambleText === this.generatedPreamble();
		mutate();
		if (wasGenerated) this.preambleText = this.generatedPreamble();
	}

	/** Shared renderer for the modal's segmented button rows. */
	private renderSegmented<T extends string>(
		parent: HTMLElement,
		label: string,
		options: Array<{ id: T; label: string; title: string }>,
		selected: T,
		onPick: (id: T) => void,
	): void {
		const row = parent.createDiv({ cls: 'tt-share-mode' });
		row.createSpan({ cls: 'tt-label', text: label });
		const group = row.createDiv({ cls: 'tt-share-mode-btns' });
		for (const opt of options) {
			const btn = group.createEl('button', { text: opt.label, cls: 'tt-btn tt-btn-sm', title: opt.title });
			btn.toggleClass('tt-btn-primary', selected === opt.id);
			btn.addEventListener('click', () => onPick(opt.id));
		}
	}

	/**
	 * The framing message that goes in front of the data. A preset seeds the
	 * textarea; editing it in place is what actually gets copied, so the presets
	 * are a starting point rather than a fixed set.
	 */
	private renderPreamble(parent: HTMLElement): void {
		// An empty stored preamble means "use the generated one" — resolve it here
		// so a format change is reflected the moment the tab re-renders.
		if (this.preambleText === '') this.preambleText = this.generatedPreamble();

		const group = parent.createDiv({ cls: 'tt-share-group tt-share-preamble' });
		const head = group.createDiv({ cls: 'tt-share-preamble-head' });
		head.createSpan({ cls: 'tt-label', text: 'Message' });

		const select = head.createEl('select', { cls: 'dropdown tt-share-preamble-select' });
		for (const preset of this.presetLibrary()) {
			select.createEl('option', { text: preset.label, value: preset.id });
		}
		select.value = this.preamblePreset;

		const textarea = group.createEl('textarea', { cls: 'tt-share-preamble-text' });
		textarea.rows = 5;
		textarea.value = this.preambleText;
		textarea.placeholder = 'Message to put in front of the data…';

		select.addEventListener('change', () => {
			this.preamblePreset = select.value as SharePreamblePresetId;
			// Switching preset replaces the text — the edited copy belonged to the
			// preset that was selected, so carrying it over would be misleading.
			this.preambleText = this.generatedPreamble();
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

	/** How the message and the data are packaged for copying. */
	private renderOutputFormat(parent: HTMLElement): void {
		const name = this.payloadFormat === 'toon' ? 'TOON' : 'JSON';
		this.renderSegmented(parent, 'Copy as', [
			{ id: 'fenced' as ShareOutputFormat, label: 'One block', title: `Message then the data in a \`\`\`${this.payloadFormat} fence — a single paste.` },
			{ id: 'separate' as ShareOutputFormat, label: 'Two fields', title: 'Message and data copied separately — for tools that take the data as its own paste or attachment.' },
			{ id: 'json-only' as ShareOutputFormat, label: `${name} only`, title: 'No message, just the data.' },
		], this.outputFormat, (id) => {
			this.outputFormat = id;
			this.rememberExportState();
			this.renderActiveTab();
		});
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

		const ext = this.payloadFormat === 'toon' ? '.toon' : '.json';
		actions.createEl('button', { text: `Save ${ext} file`, title: `Write a ${ext} file to the vault root — use this when the tool wants an attachment.` })
			.addEventListener('click', () => void this.save());
	}

	/** Compose the current output blocks around a given payload. */
	private composeBlocks(payload: string): ShareOutputBlock[] {
		const preamble = this.mode === 'ai' ? this.preambleText : '';
		return composeShareOutput(preamble, payload, this.outputFormat, this.effectivePayloadFormat());
	}

	/** TOON is offered for 'ai' exports only; 'full' always serializes as JSON. */
	private effectivePayloadFormat(): SharePayloadFormat {
		return this.mode === 'ai' ? this.payloadFormat : 'json';
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
		return filterTasksForExport(get(this.plugin.taskStore.tasks), this.criteria, localDateString());
	}

	private updateCount(): void {
		if (!this.countEl) return;
		const total = get(this.plugin.taskStore.tasks).length;
		const n = this.selectedTasks().length;
		this.countEl.setText(`${n} of ${total} task${total === 1 ? '' : 's'} selected.`);
	}

	/** Serialize the current selection in the chosen payload format. */
	private serializeSelection(tasks: Task[]): string {
		const now = new Date().toISOString();
		const validValues = this.plugin.taskJsonValidValues();
		const notesPolicy = this.mode === 'ai' ? this.notesPolicy : 'full';
		// The whole store, not `tasks` — the derived fields have to see blockers and
		// dependencies that the export filter left out.
		const derivedContext = this.plugin.taskDerivedStateContext();
		return this.effectivePayloadFormat() === 'toon'
			? serializeTasksToToon(tasks, now, validValues, notesPolicy, derivedContext)
			: serializeTasksToJson(tasks, this.mode, now, validValues, notesPolicy, derivedContext);
	}

	private async copyBlock(index: number): Promise<void> {
		const tasks = this.selectedTasks();
		if (tasks.length === 0) {
			new Notice('TTasks: no tasks match the current filters.');
			return;
		}
		const blocks = this.composeBlocks(this.serializeSelection(tasks));
		const block = blocks[index];
		if (!block) return;
		try {
			await navigator.clipboard.writeText(block.text);
			const what = block.label === '' ? `${tasks.length} task(s)` : `the ${block.label.toLowerCase()}`;
			new Notice(`TTasks: copied ${what} to the clipboard.`);
		} catch {
			new Notice('TTasks: clipboard unavailable — use the save-file button instead.');
		}
	}

	private async save(): Promise<void> {
		const tasks = this.selectedTasks();
		if (tasks.length === 0) {
			new Notice('TTasks: no tasks match the current filters.');
			return;
		}
		await this.plugin.exportTasksToJsonFrom(tasks, this.mode, {
			payloadFormat: this.effectivePayloadFormat(),
			notesPolicy: this.mode === 'ai' ? this.notesPolicy : 'full',
		});
	}

	// ── Import ───────────────────────────────────────────────────────────────────

	private renderImport(parent: HTMLElement): void {
		parent.createEl('p', {
			cls: 'setting-item-description',
			text: 'Paste an exported (or AI-edited) JSON document. Preview the changes, expand any one to see the detail, drop the ones you don\'t want, then apply the rest. Matched by ref, else by type + task name (projects only ever match projects). An entry can carry an "action" ("create" / "delete"); with none it updates the matched task, or creates it if new.',
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

		this.renderPreview = (): void => {
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
			this.importPlan = planImport(parsed.tasks, get(this.plugin.taskStore.tasks));
			// A fresh plan invalidates the old rejections — the keys refer to
			// entries that may no longer exist — and the old label updaters point
			// at elements this render is about to replace.
			this.rejectedKeys.clear();
			this.toggleCountUpdaters = [];

			const totalsEl = summaryEl.createEl('ul', { cls: 'tt-share-summary-list' });
			if (parsed.warnings.length > 0) {
				const warnEl = summaryEl.createEl('ul', { cls: 'tt-share-summary-list' });
				for (const warn of parsed.warnings) warnEl.createEl('li', { cls: 'tt-share-warn', text: `⚠ ${warn}` });
			}

			const refreshApply = (): void => {
				const plan = this.effectivePlan();
				const allowed =
					(this.applyToggles.updates && plan.updates.length > 0) ||
					(this.applyToggles.creates && plan.creates.length > 0) ||
					(this.applyToggles.deletes && plan.deletes.length > 0) ||
					(this.applyToggles.links && plan.linkAdds.length > 0) ||
					(this.applyToggles.linkRemovals && plan.linkRemovals.length > 0) ||
					(this.applyToggles.parents && plan.parentChanges.length > 0) ||
					(this.applyToggles.notes && plan.notesChanges.length > 0);
				applyBtn.disabled = !allowed;
				// Totals describe the plan that would actually run, not the paste.
				totalsEl.empty();
				const lines = isEmptyImportPlan(plan) ? ['Nothing left to apply.'] : summarizeImportPlan(plan);
				for (const line of lines) totalsEl.createEl('li', { text: line });
				for (const update of this.toggleCountUpdaters) update(plan);
			};
			this.refreshApplyState = refreshApply;

			this.renderEntryList(summaryEl, this.importPlan, refreshApply);
			this.renderApplyToggles(summaryEl, this.importPlan, refreshApply);
			refreshApply();
		};

		textarea.addEventListener('input', () => {
			this.importText = textarea.value;
		});
		previewBtn.addEventListener('click', () => this.renderPreview?.());
		applyBtn.addEventListener('click', () => void this.applyImport());

		if (this.importText.trim() !== '') this.renderPreview();
	}

	/** The plan minus everything the user rejected. */
	private effectivePlan(): ImportPlan {
		if (!this.importPlan) {
			throw new Error('effectivePlan called without a plan');
		}
		return filterImportPlan(this.importPlan, this.rejectedKeys);
	}

	/**
	 * The reviewable list: one row per change, grouped by kind. Each row expands
	 * in place to show its detail — for a note body that means the markdown
	 * rendered as it will look in the note, not raw source.
	 */
	private renderEntryList(parent: HTMLElement, plan: ImportPlan, refreshApply: () => void): void {
		const entries = importPlanEntries(plan);
		if (entries.length === 0) return;

		const list = parent.createDiv({ cls: 'tt-import-items' });
		for (const group of ENTRY_GROUPS) {
			const groupEntries = entries.filter((entry) => entry.kind === group.kind);
			if (groupEntries.length === 0) continue;
			const section = list.createDiv({ cls: 'tt-import-group' });
			section.createDiv({ cls: 'tt-group-heading', text: `${group.label} (${groupEntries.length})` });
			for (const entry of groupEntries) this.renderEntryRow(section, entry, refreshApply);
		}
	}

	private renderEntryRow(parent: HTMLElement, entry: ImportPlanEntry, refreshApply: () => void): void {
		const wrapper = parent.createDiv({ cls: 'tt-import-item' });
		wrapper.toggleClass('is-destructive', entry.destructive);
		const row = wrapper.createDiv({ cls: 'tt-import-row' });

		// Visibility via a class, not `hide()`/`show()`: those write inline
		// `display`, which then outranks the stylesheet.
		const detail = wrapper.createDiv({ cls: 'tt-import-detail' });
		let open = false;

		// `clickable-icon` is load-bearing, not decoration: app.css styles bare
		// buttons via `button:not(.clickable-icon)`, which outranks a single class
		// and would give these icon buttons a full button chrome.
		const expand = row.createEl('button', {
			cls: 'clickable-icon tt-import-expand',
			attr: { 'aria-expanded': 'false', 'aria-label': `Show details for ${entry.title}` },
		});
		setIcon(expand, 'chevron-right');

		const text = row.createDiv({ cls: 'tt-import-text' });
		text.createSpan({ cls: 'tt-import-title', text: entry.title });
		text.createSpan({ cls: 'tt-import-summary', text: entry.summary });

		const reject = row.createEl('button', {
			cls: 'clickable-icon tt-import-reject',
			attr: { 'aria-label': `Skip this change to ${entry.title}` },
		});
		setIcon(reject, 'x');

		let rendered = false;
		expand.addEventListener('click', () => {
			open = !open;
			// Bodies are rendered on first open — a paste can carry dozens, and
			// rendering them all up front stalls the preview.
			if (open && !rendered) {
				this.renderEntryDetail(detail, entry);
				rendered = true;
			}
			detail.toggleClass('is-open', open);
			expand.setAttribute('aria-expanded', String(open));
			expand.toggleClass('is-open', open);
		});

		reject.addEventListener('click', () => {
			const nowRejected = !this.rejectedKeys.has(entry.key);
			if (nowRejected) this.rejectedKeys.add(entry.key);
			else this.rejectedKeys.delete(entry.key);
			wrapper.toggleClass('is-rejected', nowRejected);
			setIcon(reject, nowRejected ? 'rotate-ccw' : 'x');
			reject.setAttribute(
				'aria-label',
				nowRejected ? `Restore this change to ${entry.title}` : `Skip this change to ${entry.title}`,
			);
			refreshApply();
		});
	}

	/** Body of the expanded row: field table, then rendered markdown for a note body. */
	private renderEntryDetail(parent: HTMLElement, entry: ImportPlanEntry): void {
		if (entry.details.length > 0) {
			const table = parent.createDiv({ cls: 'tt-import-fields' });
			for (const line of entry.details) {
				const fieldRow = table.createDiv({ cls: 'tt-import-field' });
				fieldRow.createSpan({ cls: 'tt-import-field-label', text: line.label });
				const values = fieldRow.createSpan({ cls: 'tt-import-field-values' });
				if (line.from !== undefined) {
					values.createSpan({ cls: 'tt-import-from', text: line.from });
					if (line.to !== undefined) values.createSpan({ cls: 'tt-import-arrow', text: '→' });
				}
				if (line.to !== undefined) values.createSpan({ cls: 'tt-import-to', text: line.to });
			}
		}

		if (!entry.markdown) return;
		const { from, to } = entry.markdown;
		if (from.trim() !== '') {
			const before = parent.createDiv({ cls: 'tt-import-body' });
			before.createDiv({ cls: 'tt-label', text: 'Current note body' });
			void this.renderMarkdown(before.createDiv({ cls: 'tt-import-md is-current' }), from);
		}
		const after = parent.createDiv({ cls: 'tt-import-body' });
		after.createDiv({ cls: 'tt-label', text: from.trim() === '' ? 'Note body' : 'Replacement note body' });
		void this.renderMarkdown(after.createDiv({ cls: 'tt-import-md is-incoming' }), to);
	}

	private async renderMarkdown(target: HTMLElement, markdown: string): Promise<void> {
		try {
			// sourcePath '' — an imported body has no file of its own yet, so
			// relative links resolve against the vault root.
			await MarkdownRenderer.render(this.app, markdown, target, '', this.renderHost);
		} catch {
			// Never let a malformed body break the preview; show the source instead.
			target.empty();
			target.createEl('pre', { text: markdown });
		}
	}

	private renderApplyToggles(parent: HTMLElement, plan: ImportPlan, refreshApply: () => void): void {
		const toggles = parent.createDiv({ cls: 'tt-share-apply-toggles' });
		const addToggle = (
			label: string,
			count: (p: ImportPlan) => number,
			key: keyof typeof this.applyToggles,
			destructive = false,
		): void => {
			// Rendered against the pasted plan so a row never appears or vanishes
			// mid-review; the count then tracks what rejection left behind.
			if (count(plan) === 0) return;
			const row = toggles.createDiv({ cls: 'tt-share-toggle-row' });
			row.toggleClass('is-destructive', destructive);
			const cb = row.createEl('input', { type: 'checkbox' });
			cb.checked = this.applyToggles[key];
			const id = `tt-share-apply-${key}`;
			cb.id = id;
			const labelEl = row.createEl('label', { attr: { for: id } });
			this.toggleCountUpdaters.push((effective) => {
				labelEl.setText(`${label} (${count(effective)})`);
			});
			cb.addEventListener('change', () => {
				this.applyToggles[key] = cb.checked;
				refreshApply();
			});
		};
		addToggle('Apply updates', (p) => p.updates.length, 'updates');
		addToggle('Apply new tasks', (p) => p.creates.length, 'creates');
		addToggle('Apply links', (p) => p.linkAdds.length, 'links');
		addToggle('Apply link removals', (p) => p.linkRemovals.length, 'linkRemovals', true);
		addToggle('Apply parent changes', (p) => p.parentChanges.length, 'parents');
		addToggle('Replace note bodies', (p) => p.notesChanges.length, 'notes', true);
		addToggle('Apply deletions', (p) => p.deletes.length, 'deletes', true);
	}

	private async applyImport(): Promise<void> {
		if (!this.importPlan) return;
		const plan = this.effectivePlan();
		const { created, updated, deleted, linked, unlinked, reparented, renoted } =
			await this.plugin.applyImportPlan(plan, this.applyToggles);
		const parts = [`${created} created`, `${updated} updated`];
		if (deleted > 0) parts.push(`${deleted} deleted`);
		if (linked > 0) parts.push(`${linked} linked`);
		if (unlinked > 0) parts.push(`${unlinked} unlinked`);
		if (reparented > 0) parts.push(`${reparented} reparented`);
		if (renoted > 0) parts.push(`${renoted} note bodies replaced`);
		new Notice(`TTasks: imported — ${parts.join(', ')}.`);
		// The modal stays open, so the preview has to be re-planned against the
		// vault we just wrote — otherwise Apply would offer the same edits again.
		this.renderPreview?.();
	}
}
