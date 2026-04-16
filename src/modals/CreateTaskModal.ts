import { App, Component, MarkdownRenderer, Modal, Notice } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { TaskPriority, TaskRecordType, TaskStatus, TaskType } from '../types';
import { resolveEmergencyStatus } from '../settings';
import { RECURRENCE_OPTIONS, RECURRENCE_LABELS, RECURRENCE_TYPES, RECURRENCE_TYPE_LABELS } from '../store/recurrence';

const PRIORITIES: TaskPriority[]    = ['None', 'Low', 'Medium', 'High'];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
	High:   'var(--color-red)',
	Medium: 'var(--color-orange)',
	Low:    'var(--color-blue)',
	None:   'var(--text-faint)',
};

const MOBILE_QUICK_CREATE_PREF_KEY = 'ttasks.mobileQuickCreate';
const MOBILE_QUICK_CREATE_HINT_DISMISSED_KEY = 'ttasks.mobileQuickCreateHintDismissed';

export class CreateTaskModal extends Modal {
	private plugin: TTasksPlugin;

	private name                       = '';
	private type: TaskRecordType;
	private status: TaskStatus;
	private priority: TaskPriority     = 'None';
	private category                   = '';
	private task_type: TaskType | null = null;
	private depends_on: string[]       = [];
	private due_date                   = '';
	private start_date                 = '';
	private estimated_days: number | null = null;
	private notes                      = '';
	private recurrence: string | null  = null;
	private recurrence_type: string | null = null;
	private submitting                 = false;
	private notesRenderComponent: Component | null = null;
	private notesRenderFrame: number | null = null;
	private createBtnEl: HTMLButtonElement | null = null;

	constructor(app: App, plugin: TTasksPlugin, defaultType: TaskRecordType = 'task') {
		super(app);
		this.plugin = plugin;
		this.type = defaultType;
		this.status = resolveEmergencyStatus(this.plugin.settings.statuses);
	}

	private get categories(): string[] {
		return ['', ...(this.plugin.settings.categories ?? [])];
	}

	private get taskTypes(): string[] {
		return ['', ...(this.plugin.settings.taskTypes ?? [])];
	}

	private get statuses(): TaskStatus[] {
		return this.plugin.settings.statuses ?? ['Active'];
	}

	private get statusColors(): Record<string, string> {
		return this.plugin.settings.statusColors ?? {};
	}

	private get categoryColors(): Record<string, string> {
		return this.plugin.settings.categoryColors ?? {};
	}

	private get taskTypeColors(): Record<string, string> {
		return this.plugin.settings.taskTypeColors ?? {};
	}

	onOpen() {
		const { contentEl } = this;
		const isMobile = window.matchMedia('(max-width: 768px)').matches;
		let quickCreateMode = this.getInitialQuickCreateMode(isMobile);
		contentEl.addClass('tt-modal');
		this.modalEl.addClass('tt-create-modal');
		this.notesRenderComponent = new Component();
		this.notesRenderComponent.load();

		// Cmd/Ctrl+Enter submits from anywhere in the modal
		this.modalEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void this.submit();
			}
		});

		const sectionsRoot = contentEl.createDiv('tt-modal-sections');

		// ── Name ────────────────────────────────────────────────────────────────
		const nameInput = sectionsRoot.createEl('input', {
			cls: 'tt-modal-name',
			attr: {
				type: 'text',
				placeholder: this.type === 'project' ? 'Project name…' : 'Task name…',
			},
		});
		nameInput.focus();
		nameInput.addEventListener('input', () => { this.name = nameInput.value; });
		nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { e.preventDefault(); void this.submit(); }
		});

		const basicsSection = this.createModalSection(sectionsRoot, 'Basics', true);
		const schedulingSection = this.createModalSection(sectionsRoot, 'Scheduling', !isMobile);
		const notesSection = this.createModalSection(sectionsRoot, 'Notes', !isMobile);
		const advancedSection = this.createModalSection(sectionsRoot, 'Advanced', false);
		const schedulingSectionEl = schedulingSection.closest('.tt-modal-section') as HTMLElement;
		const notesSectionEl = notesSection.closest('.tt-modal-section') as HTMLElement;
		const advancedSectionEl = advancedSection.closest('.tt-modal-section') as HTMLElement;

		// ── Type — full-width segmented ──────────────────────────────────────────
		const typeGroup = basicsSection.createDiv('tt-modal-type-group');
		const taskTypeField = this.field(basicsSection, 'Task Type');

		for (const [val, label] of [['task', 'Task'], ['project', 'Project']] as [TaskRecordType, string][]) {
			const btn = typeGroup.createEl('button', {
				text: label,
				cls: `tt-modal-type-btn${val === this.type ? ' tt-chip-active' : ''}`,
			});
			btn.addEventListener('click', () => {
				this.type = val;
				typeGroup.querySelectorAll('.tt-modal-type-btn').forEach(b => b.removeClass('tt-chip-active'));
				btn.addClass('tt-chip-active');
				// Gray out task type — keeps layout stable, communicates inapplicability
				taskTypeField.style.opacity       = val === 'project' ? '0.35' : '';
				taskTypeField.style.pointerEvents = val === 'project' ? 'none'  : '';
				nameInput.placeholder = val === 'project' ? 'Project name…' : 'Task name…';
				// Update create button label
				const createBtn = contentEl.querySelector<HTMLButtonElement>('.tt-modal-btn-primary');
				if (createBtn) createBtn.setText(val === 'project' ? 'Create project' : 'Create task');
			});
		}

		// ── Priority ────────────────────────────────────────────────────────────
		const priorityField = this.field(basicsSection, 'Priority');
		const priorityChips = priorityField.createDiv('tt-modal-chips');

		for (const p of PRIORITIES) {
			const btn = priorityChips.createEl('button', {
				text: p,
				cls: `tt-modal-chip${p === 'None' ? ' tt-chip-active' : ''}`,
			});
			if (p === 'None') this.applyPriorityStyle(btn, p);
			btn.addEventListener('click', () => {
				this.priority = p;
				priorityChips.querySelectorAll<HTMLButtonElement>('.tt-modal-chip').forEach(b => {
					b.removeClass('tt-chip-active');
					b.style.removeProperty('background');
					b.style.removeProperty('border-color');
					b.style.removeProperty('color');
				});
				btn.addClass('tt-chip-active');
				this.applyPriorityStyle(btn, p);
			});
		}

		if (isMobile) {
			const quickRow = sectionsRoot.createDiv('tt-modal-quick-row');
			const quickToggle = quickRow.createEl('button', {
				cls: 'tt-modal-quick-toggle',
				attr: { type: 'button' },
			});
			let quickHintEl: HTMLElement | null = null;
			if (this.shouldShowQuickCreateHint()) {
				quickHintEl = sectionsRoot.createDiv('tt-modal-quick-hint');
				quickHintEl.createSpan({
					text: 'Quick Create keeps only essentials visible. Toggle off anytime for full details.',
				});
				const dismissHintBtn = quickHintEl.createEl('button', {
					cls: 'tt-modal-quick-hint-dismiss',
					text: 'Got it',
					attr: { type: 'button' },
				});
				dismissHintBtn.addEventListener('click', () => {
					this.dismissQuickCreateHint();
					quickHintEl?.remove();
					quickHintEl = null;
				});
			}

			const applyQuickMode = (enabled: boolean) => {
				quickCreateMode = enabled;
				this.persistQuickCreateMode(enabled);
				this.modalEl.toggleClass('tt-mobile-quick-create', enabled);
				quickToggle.setText(enabled ? 'Quick create on' : 'Quick create off');
				quickToggle.setAttribute('aria-pressed', String(enabled));
				quickToggle.toggleClass('tt-chip-active', enabled);
				taskTypeField.toggleClass('tt-hidden', enabled);
				priorityField.toggleClass('tt-hidden', enabled);
				schedulingSectionEl.toggleClass('tt-hidden', enabled);
				notesSectionEl.toggleClass('tt-hidden', enabled);
				advancedSectionEl.toggleClass('tt-hidden', enabled);
				if (enabled) {
					this.setSectionOpen(schedulingSectionEl, false);
					this.setSectionOpen(notesSectionEl, false);
					this.setSectionOpen(advancedSectionEl, false);
				}
			};

			applyQuickMode(quickCreateMode);
			quickToggle.addEventListener('click', () => applyQuickMode(!quickCreateMode));
		}

		// ── Task Type dropdown (grayed out for project) ─────────────────────────
		if (this.type === 'project') {
			taskTypeField.style.opacity       = '0.35';
			taskTypeField.style.pointerEvents = 'none';
		}
		const taskTypeSelect = taskTypeField.createEl('select', { cls: 'tt-modal-select' });
		for (const t of this.taskTypes) {
			taskTypeSelect.createEl('option', { text: t || '— none —', value: t });
		}
		const applyTaskTypeTint = () => {
			const color = this.task_type ? this.taskTypeColors[this.task_type] : undefined;
			if (!color) {
				taskTypeSelect.style.removeProperty('background');
				taskTypeSelect.style.removeProperty('border-color');
				taskTypeSelect.style.removeProperty('color');
				return;
			}
			taskTypeSelect.style.background = `color-mix(in srgb, ${color} 10%, var(--background-primary))`;
			taskTypeSelect.style.borderColor = `color-mix(in srgb, ${color} 42%, var(--background-modifier-border))`;
			taskTypeSelect.style.color = color;
		};
		applyTaskTypeTint();
		taskTypeSelect.addEventListener('change', () => {
			this.task_type = (taskTypeSelect.value as TaskType) || null;
			applyTaskTypeTint();
		});

		// ── Start Date | After Task (mutually exclusive) ─────────────────────────
		const startRow = schedulingSection.createDiv('tt-modal-pair-row');

		const startDateField = this.field(startRow, 'Start Date');
		const startDateControl = startDateField.createDiv('tt-modal-date-control');
		const startDateInput = startDateControl.createEl('input', {
			cls: 'tt-modal-input',
			attr: { type: 'date' },
		});
		const startDateActions = startDateControl.createDiv('tt-modal-date-actions');
		const startTodayBtn = startDateActions.createEl('button', {
			cls: 'tt-modal-mini-btn',
			text: 'Today',
		});
		const startClearBtn = startDateActions.createEl('button', {
			cls: 'tt-modal-mini-btn',
			text: 'Clear',
		});

		const afterTaskField = this.field(startRow, 'After Task(s)');
		const allTasks = get(this.plugin.taskStore.tasks);
		const depsChipsEl = afterTaskField.createDiv('tt-modal-chips');
		const afterTaskSelect = afterTaskField.createEl('select', { cls: 'tt-modal-select' });

		const renderDepsChips = () => {
			depsChipsEl.empty();
			for (const depPath of this.depends_on) {
				const depTask = allTasks.find(t => t.path.replace(/\.md$/, '') === depPath);
				const label = depTask?.name ?? depPath.split('/').pop() ?? depPath;
				const chip = depsChipsEl.createEl('span', { cls: 'tt-modal-chip tt-chip-active', text: label });
				const removeBtn = chip.createEl('span', { text: ' ×', cls: 'tt-modal-chip-remove' });
				removeBtn.addEventListener('click', () => {
					this.depends_on = this.depends_on.filter(d => d !== depPath);
					renderDepsChips();
					renderAfterTaskOptions();
					if (this.depends_on.length === 0) {
						startDateInput.disabled = false;
						startTodayBtn.disabled = false;
					}
				});
			}
		};

		const renderAfterTaskOptions = () => {
			afterTaskSelect.empty();
			afterTaskSelect.createEl('option', { text: '+ Add dependency…', value: '' });
			for (const t of allTasks) {
				const path = t.path.replace(/\.md$/, '');
				if (this.depends_on.includes(path)) continue;
				afterTaskSelect.createEl('option', { text: t.name, value: path });
			}
		};

		renderAfterTaskOptions();
		renderDepsChips();

		startDateInput.addEventListener('change', () => {
			this.start_date = startDateInput.value;
			if (startDateInput.value) {
				this.depends_on = [];
				renderDepsChips();
				renderAfterTaskOptions();
				afterTaskSelect.disabled = true;
			} else {
				afterTaskSelect.disabled = false;
			}
		});

		startTodayBtn.addEventListener('click', () => {
			const today = new Date().toISOString().slice(0, 10);
			startDateInput.value = today;
			this.start_date = today;
			this.depends_on = [];
			renderDepsChips();
			renderAfterTaskOptions();
			afterTaskSelect.disabled = true;
		});

		startClearBtn.addEventListener('click', () => {
			startDateInput.value = '';
			this.start_date = '';
			afterTaskSelect.disabled = false;
		});

		afterTaskSelect.addEventListener('change', () => {
			const val = afterTaskSelect.value;
			if (!val) return;
			this.depends_on = [...this.depends_on, val];
			afterTaskSelect.value = '';
			renderDepsChips();
			renderAfterTaskOptions();
			this.start_date          = '';
			startDateInput.value     = '';
			startDateInput.disabled  = true;
			startTodayBtn.disabled   = true;
		});

		// ── Due Date | Est. Days (mutually exclusive) ────────────────────────────
		const dueRow = schedulingSection.createDiv('tt-modal-pair-row');

		const dueDateField = this.field(dueRow, 'Due Date');
		const dueDateControl = dueDateField.createDiv('tt-modal-date-control');
		const dueDateInput = dueDateControl.createEl('input', {
			cls: 'tt-modal-input',
			attr: { type: 'date' },
		});
		const dueDateActions = dueDateControl.createDiv('tt-modal-date-actions');
		const dueTodayBtn = dueDateActions.createEl('button', {
			cls: 'tt-modal-mini-btn',
			text: 'Today',
		});
		const dueClearBtn = dueDateActions.createEl('button', {
			cls: 'tt-modal-mini-btn',
			text: 'Clear',
		});

		const estField = this.field(dueRow, 'Est. Days');
		const estInput = estField.createEl('input', {
			cls: 'tt-modal-input',
			attr: { type: 'number', min: '0', step: '0.5', placeholder: '—' },
		});

		dueDateInput.addEventListener('change', () => {
			this.due_date = dueDateInput.value;
			if (dueDateInput.value) {
				this.estimated_days  = null;
				estInput.value       = '';
				estInput.disabled    = true;
			} else {
				estInput.disabled    = false;
			}
		});

		estInput.addEventListener('change', () => {
			const parsed = estInput.value ? parseFloat(estInput.value) : null;
			this.estimated_days = parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
			if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
				estInput.value = '';
			}
			if (estInput.value) {
				this.due_date           = '';
				dueDateInput.value      = '';
				dueDateInput.disabled   = true;
				dueTodayBtn.disabled    = true;
			} else {
				dueDateInput.disabled   = false;
				dueTodayBtn.disabled    = false;
			}
		});

		dueTodayBtn.addEventListener('click', () => {
			const today = new Date().toISOString().slice(0, 10);
			dueDateInput.value = today;
			this.due_date = today;
			this.estimated_days = null;
			estInput.value = '';
			estInput.disabled = true;
		});

		dueClearBtn.addEventListener('click', () => {
			dueDateInput.value = '';
			this.due_date = '';
			estInput.disabled = false;
			dueTodayBtn.disabled = false;
		});

		// ── Notes ────────────────────────────────────────────────────────────────
		const notesField = this.field(notesSection, 'Notes');
		const notesShell = notesField.createDiv('tt-hybrid-notes');
		const notesPreview = notesShell.createDiv('tt-hybrid-notes-preview');
		const notesEl = notesShell.createEl('textarea', {
			cls: 'tt-modal-textarea tt-hybrid-notes-editor',
			attr: { rows: '5', placeholder: 'Add notes…' },
		});

		const renderNotes = async () => {
			if (!this.notesRenderComponent) return;
			notesPreview.innerHTML = '';
			await MarkdownRenderer.render(this.app, this.notes || '_No notes yet._', notesPreview, this.plugin.manifest.id, this.notesRenderComponent);
		};

		const scheduleRenderNotes = () => {
			if (this.notesRenderFrame !== null) cancelAnimationFrame(this.notesRenderFrame);
			this.notesRenderFrame = requestAnimationFrame(() => {
				this.notesRenderFrame = null;
				void renderNotes();
			});
		};

		notesEl.addEventListener('input', () => {
			this.notes = notesEl.value;
			scheduleRenderNotes();
		});
		void renderNotes();

		// ── More options (Status + Category) ────────────────────────────────────
		const details = advancedSection.createDiv('tt-modal-details');

		const statusField = this.field(details, 'Status');
		const statusChips = statusField.createDiv('tt-modal-chips');
		for (const s of this.statuses) {
			const btn = statusChips.createEl('button', {
				text: s,
				cls: `tt-modal-chip${s === this.status ? ' tt-chip-active' : ''}`,
			});
			if (s === this.status && this.statusColors[s]) {
				btn.style.background = this.statusColors[s];
				btn.style.borderColor = this.statusColors[s];
			}
			btn.addEventListener('click', () => {
				this.status = s;
				statusChips.querySelectorAll<HTMLButtonElement>('.tt-modal-chip').forEach(b => {
					b.removeClass('tt-chip-active');
					b.style.removeProperty('background');
					b.style.removeProperty('border-color');
				});
				btn.addClass('tt-chip-active');
				if (this.statusColors[s]) {
					btn.style.background = this.statusColors[s];
					btn.style.borderColor = this.statusColors[s];
				}
			});
		}

		const categoryField = this.field(details, 'Category');
		const categorySelect = categoryField.createEl('select', { cls: 'tt-modal-select' });
		for (const c of this.categories) {
			categorySelect.createEl('option', { text: c || '— none —', value: c });
		}
		const applyCategoryTint = () => {
			const color = this.category ? this.categoryColors[this.category] : undefined;
			if (!color) {
				categorySelect.style.removeProperty('background');
				categorySelect.style.removeProperty('border-color');
				categorySelect.style.removeProperty('color');
				return;
			}
			categorySelect.style.background = `color-mix(in srgb, ${color} 10%, var(--background-primary))`;
			categorySelect.style.borderColor = `color-mix(in srgb, ${color} 42%, var(--background-modifier-border))`;
			categorySelect.style.color = color;
		};
		applyCategoryTint();
		categorySelect.addEventListener('change', () => {
			this.category = categorySelect.value;
			applyCategoryTint();
		});

		// ── Recurrence ───────────────────────────────────────────────────────────
		const recurrenceField = this.field(details, 'Repeats');
		const recurrenceRow = recurrenceField.createDiv('tt-modal-recurrence-row');
		const recurrenceSelect = recurrenceRow.createEl('select', { cls: 'tt-modal-select' });
		recurrenceSelect.createEl('option', { text: '— never —', value: '' });
		for (const r of RECURRENCE_OPTIONS) {
			recurrenceSelect.createEl('option', { text: RECURRENCE_LABELS[r], value: r });
		}

		const recurrenceTypeSelect = recurrenceRow.createEl('select', {
			cls: 'tt-modal-select tt-modal-recurrence-type',
		});
		for (const t of RECURRENCE_TYPES) {
			recurrenceTypeSelect.createEl('option', { text: RECURRENCE_TYPE_LABELS[t], value: t });
		}
		recurrenceTypeSelect.style.display = 'none';

		recurrenceSelect.addEventListener('change', () => {
			this.recurrence = recurrenceSelect.value || null;
			recurrenceTypeSelect.style.display = this.recurrence ? '' : 'none';
		});
		recurrenceTypeSelect.addEventListener('change', () => {
			this.recurrence_type = recurrenceTypeSelect.value || null;
		});

		// ── Buttons ──────────────────────────────────────────────────────────────
		const btnRow = contentEl.createDiv('tt-modal-btn-row');
		btnRow.createEl('button', { text: 'Cancel', cls: 'tt-modal-btn' })
			.addEventListener('click', () => this.close());
		const primaryBtn = btnRow.createEl('button', { text: 'Create task', cls: 'tt-modal-btn tt-modal-btn-primary' });
		this.createBtnEl = primaryBtn;
		primaryBtn.disabled = !this.name.trim();
		nameInput.addEventListener('input', () => {
			this.name = nameInput.value;
			primaryBtn.disabled = this.submitting || !this.name.trim();
		});
		primaryBtn.addEventListener('click', () => void this.submit(primaryBtn));
	}

	private getInitialQuickCreateMode(isMobile: boolean): boolean {
		if (!isMobile) return false;
		try {
			const saved = localStorage.getItem(MOBILE_QUICK_CREATE_PREF_KEY);
			if (saved === '1') return true;
			if (saved === '0') return false;
		} catch {
			// Ignore storage access issues and fall back to mobile default.
		}
		return true;
	}

	private persistQuickCreateMode(enabled: boolean): void {
		try {
			localStorage.setItem(MOBILE_QUICK_CREATE_PREF_KEY, enabled ? '1' : '0');
		} catch {
			// Ignore storage access issues to avoid blocking task creation UX.
		}
	}

	private shouldShowQuickCreateHint(): boolean {
		try {
			return localStorage.getItem(MOBILE_QUICK_CREATE_HINT_DISMISSED_KEY) !== '1';
		} catch {
			return true;
		}
	}

	private dismissQuickCreateHint(): void {
		try {
			localStorage.setItem(MOBILE_QUICK_CREATE_HINT_DISMISSED_KEY, '1');
		} catch {
			// Ignore storage access issues to avoid blocking task creation UX.
		}
	}

	// ── Helpers ──────────────────────────────────────────────────────────────────

	private field(parent: HTMLElement, label: string): HTMLElement {
		const wrap = parent.createDiv('tt-modal-field');
		wrap.createEl('label', { text: label, cls: 'tt-modal-label' });
		return wrap;
	}

	private setSectionOpen(section: HTMLElement, open: boolean): void {
		section.toggleClass('is-open', open);
		const toggle = section.querySelector<HTMLButtonElement>('.tt-modal-section-toggle');
		if (toggle) {
			toggle.setAttribute('aria-expanded', String(open));
		}
	}

	private createModalSection(parent: HTMLElement, title: string, isOpenByDefault: boolean): HTMLElement {
		const section = parent.createDiv(`tt-modal-section${isOpenByDefault ? ' is-open' : ''}`);
		const toggle = section.createEl('button', {
			cls: 'tt-modal-section-toggle',
			attr: { type: 'button', 'aria-expanded': String(isOpenByDefault) },
		});
		toggle.createSpan({ cls: 'tt-modal-section-title', text: title });
		toggle.createSpan({ cls: 'tt-modal-section-chevron', text: '▾' });

		const body = section.createDiv('tt-modal-section-body');
		this.setSectionOpen(section, isOpenByDefault);
		toggle.addEventListener('click', () => {
			this.setSectionOpen(section, !section.hasClass('is-open'));
		});

		return body;
	}

	private applyPriorityStyle(btn: HTMLButtonElement, p: TaskPriority) {
		btn.style.background  = PRIORITY_COLORS[p];
		btn.style.borderColor = PRIORITY_COLORS[p];
		btn.style.color       = '#fff';
	}

	// ── Submit ───────────────────────────────────────────────────────────────────

	private async submit(primaryBtn?: HTMLButtonElement) {
		if (this.submitting) return;
		const name = this.name.trim();
		if (!name) {
			new Notice(`${this.type === 'project' ? 'Project' : 'Task'} name is required.`);
			return;
		}
		const startDate = this.depends_on.length > 0 ? null : (this.start_date || null);
		const dueDate = this.estimated_days !== null ? null : (this.due_date || null);

		this.submitting = true;
		if (primaryBtn) {
			primaryBtn.disabled = true;
			primaryBtn.setText('Creating…');
		}
		try {
			const task = await this.plugin.taskStore.create({
				type:           this.type,
				name,
				category:       this.category || null,
				status:         this.status,
				priority:       this.priority,
				task_type:      this.task_type,
				parent_task:    null,
				depends_on:     this.depends_on,
				blocked_reason: '',
				assigned_to:    '',
				source:         '',
				start_date:     startDate,
				due_date:       dueDate,
				estimated_days:  this.estimated_days,
				created:         new Date().toISOString().slice(0, 10),
				completed:       null,
				notes:           this.notes,
				recurrence:      this.recurrence,
				recurrence_type: this.recurrence_type,
			});
			this.close();
			await this.plugin.taskStore.openDetail(task.path);
		} catch (e) {
			console.error('[TTasks] Failed to create task:', e);
			new Notice('TTasks: Failed to create task — check console for details.');
		} finally {
			this.submitting = false;
			if (primaryBtn) {
				primaryBtn.disabled = !this.name.trim();
				primaryBtn.setText(this.type === 'project' ? 'Create project' : 'Create task');
			}
		}
	}

	onClose() {
		super.onClose();
		if (this.notesRenderFrame !== null) {
			cancelAnimationFrame(this.notesRenderFrame);
			this.notesRenderFrame = null;
		}
		this.notesRenderComponent?.unload();
		this.notesRenderComponent = null;
		this.createBtnEl = null;
		this.contentEl.empty();
	}
}
