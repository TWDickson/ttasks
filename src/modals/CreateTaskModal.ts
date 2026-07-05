import { App, Component, MarkdownRenderer, Modal, Notice, setIcon } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { TaskPriority, TaskRecordType, TaskStatus } from '../types';
import { resolveEmergencyStatus } from '../settings';
import { RECURRENCE_OPTIONS, RECURRENCE_LABELS, RECURRENCE_TYPES, RECURRENCE_TYPE_LABELS } from '../store/recurrence';
import { PRIORITY_COLORS } from '../constants';
import { localDateString } from '../utils/dateUtils';
import { sortDependencyFirst } from '../utils/dependencySort';
import { getFieldOptions, getOptionColor } from './modalFieldHelpers';
import { taskFields } from '../schema/taskFields';
import { withCurrentOption } from './chipSelection';

const MOBILE_QUICK_CREATE_PREF_KEY = 'ttasks.mobileQuickCreate';
const MOBILE_QUICK_CREATE_HINT_DISMISSED_KEY = 'ttasks.mobileQuickCreateHintDismissed';

export class CreateTaskModal extends Modal {
	private plugin: TTasksPlugin;

	// Schema-driven form state
	private formValues: Record<string, any> = {
		name: '',
		type: 'task' as TaskRecordType,
		status: '',
		priority: 'None' as TaskPriority,
		area: '',
		labels: [] as string[],
		depends_on: [] as string[],
		parent_task: null as string | null,
		due_date: '',
		start_date: '',
		estimated_days: null as number | null,
		workweek_only: false,
		holiday_dates: [] as string[],
		notes: '',
		recurrence: null as string | null,
		recurrence_type: null as string | null,
	};

	private submitting = false;
	private notesRenderComponent: Component | null = null;
	private notesRenderFrame: number | null = null;
	private createBtnEl: HTMLButtonElement | null = null;

	constructor(
		app: App,
		plugin: TTasksPlugin,
		defaultType: TaskRecordType = 'task',
		options?: {
			initialDependsOn?: string[];
			/** Inherited context for "create dependent/sibling task" flows. */
			prefill?: {
				name?: string;
				parent_task?: string | null;
				area?: string | null;
				labels?: string[];
				priority?: TaskPriority;
				start_date?: string | null;
				due_date?: string | null;
			};
		},
	) {
		super(app);
		this.plugin = plugin;
		this.formValues.type = defaultType;
		this.formValues.status = resolveEmergencyStatus(this.plugin.settings.statuses);
		if (options?.initialDependsOn?.length) {
			this.formValues.depends_on = options.initialDependsOn.map(p => p.replace(/\.md$/, ''));
		}
		const prefill = options?.prefill;
		if (prefill) {
			if (prefill.name) this.formValues.name = prefill.name;
			if (prefill.parent_task) this.formValues.parent_task = prefill.parent_task.replace(/\.md$/, '');
			if (prefill.area) this.formValues.area = prefill.area;
			if (prefill.labels?.length) this.formValues.labels = [...prefill.labels];
			if (prefill.priority) this.formValues.priority = prefill.priority;
			if (prefill.start_date) this.formValues.start_date = prefill.start_date;
			if (prefill.due_date) this.formValues.due_date = prefill.due_date;
		}
	}

	private get areas(): string[] {
		const areaDefinition = taskFields.find(f => f.name === 'area');
		const areaOptions = areaDefinition ? getFieldOptions(areaDefinition, this.plugin.settings) : [];
		return areaOptions;
	}

	private get statuses(): TaskStatus[] {
		const statusDefinition = taskFields.find(f => f.name === 'status');
		const statusOptions = statusDefinition ? getFieldOptions(statusDefinition, this.plugin.settings) : ['Active'];
		return (statusOptions.length > 0 ? statusOptions : ['Active']) as TaskStatus[];
	}

	private get statusColors(): Record<string, string> {
		return this.plugin.settings.statusColors ?? {};
	}

	private get areaColors(): Record<string, string> {
		return this.plugin.settings.areaColors ?? {};
	}

	private get labelColors(): Record<string, string> {
		return this.plugin.settings.labelColors ?? {};
	}

	onOpen() {
		const { contentEl } = this;
		const isMobile = window.matchMedia('(max-width: 768px)').matches;
		let quickCreateMode = this.getInitialQuickCreateMode(isMobile);
		const allTasks = get(this.plugin.taskStore.tasks);
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
				placeholder: this.formValues.type === 'project' ? 'Project name…' : 'Task name…',
			},
		});
		nameInput.focus();
		nameInput.addEventListener('input', () => { this.formValues.name = nameInput.value; });
		nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') { e.preventDefault(); void this.submit(); }
		});

		const basicsSection = this.createModalSection(sectionsRoot, 'Basics', true);
		const schedulingSection = this.createModalSection(sectionsRoot, 'Scheduling', !isMobile);
		const notesSection = this.createModalSection(sectionsRoot, 'Notes', !isMobile);
		const recurrenceSection = this.createModalSection(sectionsRoot, 'Repeats', false);
		const schedulingSectionEl = schedulingSection.closest('.tt-modal-section') as HTMLElement;
		const notesSectionEl = notesSection.closest('.tt-modal-section') as HTMLElement;
		const recurrenceSectionEl = recurrenceSection.closest('.tt-modal-section') as HTMLElement;

		// ── Type — full-width segmented ──────────────────────────────────────────
		const typeGroup = basicsSection.createDiv('tt-modal-type-group');
		const labelsField = this.field(basicsSection, 'Labels');
		const projectCalendarField = this.field(basicsSection, 'Workweek Schedule');
		const projectCalendarToggle = projectCalendarField.createEl('input', {
			attr: { type: 'checkbox', id: 'tt-project-workweek-only' },
		});
		const projectCalendarToggleLabel = projectCalendarField.createEl('label', {
			text: 'Project runs on workdays only (skip weekends)',
			attr: { for: 'tt-project-workweek-only' },
		});
		projectCalendarToggleLabel.addClass('tt-modal-inline-label');

		const projectHolidaysField = this.field(basicsSection, 'Project Holidays');
		const projectHolidaysInput = projectHolidaysField.createEl('input', {
			cls: 'tt-modal-input',
			attr: {
				type: 'text',
				placeholder: 'YYYY-MM-DD, YYYY-MM-DD',
			},
		});

		const syncProjectCalendarVisibility = () => {
			const isProject = this.formValues.type === 'project';
			projectCalendarField.toggleClass('tt-hidden', !isProject);
			projectHolidaysField.toggleClass('tt-hidden', !isProject || !this.formValues.workweek_only);
		};

		projectCalendarToggle.addEventListener('change', () => {
			this.formValues.workweek_only = projectCalendarToggle.checked;
			if (!this.formValues.workweek_only) {
				this.formValues.holiday_dates = [];
				projectHolidaysInput.value = '';
			}
			syncProjectCalendarVisibility();
		});

		projectHolidaysInput.addEventListener('change', () => {
			this.formValues.holiday_dates = this.parseHolidayDates(projectHolidaysInput.value);
		});

		for (const [val, label] of [['task', 'Task'], ['project', 'Project']] as [TaskRecordType, string][]) {
			const btn = typeGroup.createEl('button', {
				text: label,
				cls: `tt-modal-type-btn${val === this.formValues.type ? ' tt-chip-active' : ''}`,
			});
			btn.addEventListener('click', () => {
				this.formValues.type = val;
				if (val !== 'project') {
					this.formValues.workweek_only = false;
					this.formValues.holiday_dates = [];
					projectCalendarToggle.checked = false;
					projectHolidaysInput.value = '';
				}
				typeGroup.querySelectorAll('.tt-modal-type-btn').forEach(b => b.removeClass('tt-chip-active'));
				btn.addClass('tt-chip-active');
				// Gray out labels for projects to keep layout stable.
				labelsField.style.opacity       = val === 'project' ? '0.35' : '';
				labelsField.style.pointerEvents = val === 'project' ? 'none'  : '';
				nameInput.placeholder = val === 'project' ? 'Project name…' : 'Task name…';
				// Update create button label
				const createBtn = contentEl.querySelector<HTMLButtonElement>('.tt-modal-btn-primary');
				if (createBtn) createBtn.setText(val === 'project' ? 'Create project' : 'Create task');
				syncProjectCalendarVisibility();
			});
		}
		syncProjectCalendarVisibility();

		// ── Status ───────────────────────────────────────────────────────────────
		const statusField = this.field(basicsSection, 'Status');
		const statusChips = statusField.createDiv('tt-modal-chips');
		const statusDefinition = taskFields.find(f => f.name === 'status')!;
		this.renderSingleSelectChipGroup({
			container: statusChips,
			options: withCurrentOption(this.statuses, this.formValues.status),
			selected: this.formValues.status,
			field: statusDefinition,
			onSelect: (value) => {
				this.formValues.status = value as TaskStatus;
			},
		});

		// ── Parent Task (Project) ─────────────────────────────────────────────
		const parentTaskField = this.field(basicsSection, 'Parent Project');
		const parentTaskSelect = parentTaskField.createEl('select', { cls: 'tt-modal-select' });
		const projects = allTasks.filter(t => t.type === 'project');
		parentTaskSelect.createEl('option', { text: '— none —', value: '' });
		for (const p of projects.sort((a, b) => a.name.localeCompare(b.name))) {
			const path = p.path.replace(/\.md$/, '');
			parentTaskSelect.createEl('option', { text: p.name, value: path });
		}
		// Reflect prefilled values (create-dependent inherits its source's project)
		if (this.formValues.parent_task) parentTaskSelect.value = this.formValues.parent_task;
		parentTaskSelect.addEventListener('change', () => {
			this.formValues.parent_task = parentTaskSelect.value || null;
			renderAfterTaskOptions();
		});

		// ── Priority ────────────────────────────────────────────────────────────
		const priorityField = this.field(basicsSection, 'Priority');
		const priorityChips = priorityField.createDiv('tt-modal-chips');
		const priorityDefinition = taskFields.find(f => f.name === 'priority')!;
		const schemaPriorityOptions = getFieldOptions(priorityDefinition, this.plugin.settings);
		const fallbackPriorityOptions = Array.isArray(priorityDefinition.options)
			? (priorityDefinition.options as string[])
			: [];
		const priorityOptions = schemaPriorityOptions.length > 0
			? schemaPriorityOptions
			: fallbackPriorityOptions;

		this.renderSingleSelectChipGroup({
			container: priorityChips,
			options: withCurrentOption(priorityOptions, this.formValues.priority),
			selected: this.formValues.priority,
			field: priorityDefinition,
			onSelect: (value) => {
				this.formValues.priority = value as TaskPriority;
			},
		});

		// ── Area ────────────────────────────────────────────────────────────────
		const areaField = this.field(basicsSection, 'Area');
		const areaSelect = areaField.createEl('select', { cls: 'tt-modal-select' });
		areaSelect.createEl('option', { text: '— none —', value: '' });
		for (const areaOption of this.areas) {
			areaSelect.createEl('option', { text: areaOption, value: areaOption });
		}
		if (this.formValues.area) areaSelect.value = this.formValues.area;
		const applyAreaTint = () => {
			const color = this.formValues.area ? this.areaColors[this.formValues.area] : undefined;
			if (!color) {
				areaSelect.style.removeProperty('background');
				areaSelect.style.removeProperty('border-color');
				areaSelect.style.removeProperty('color');
				return;
			}
			areaSelect.style.background = `color-mix(in srgb, ${color} 10%, var(--background-primary))`;
			areaSelect.style.borderColor = `color-mix(in srgb, ${color} 42%, var(--background-modifier-border))`;
			areaSelect.style.color = color;
		};
		applyAreaTint();
		areaSelect.addEventListener('change', () => {
			this.formValues.area = areaSelect.value;
			applyAreaTint();
		});

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
				labelsField.toggleClass('tt-hidden', enabled);
				priorityField.toggleClass('tt-hidden', enabled);
				schedulingSectionEl.toggleClass('tt-hidden', enabled);
				notesSectionEl.toggleClass('tt-hidden', enabled);
				recurrenceSectionEl.toggleClass('tt-hidden', enabled);
				if (enabled) {
					this.setSectionOpen(schedulingSectionEl, false);
					this.setSectionOpen(notesSectionEl, false);
					this.setSectionOpen(recurrenceSectionEl, false);
				}
			};

			applyQuickMode(quickCreateMode);
			quickToggle.addEventListener('click', () => applyQuickMode(!quickCreateMode));
		}

		// Labels dropdown for tasks only
		if (this.formValues.type === 'project') {
			labelsField.style.opacity       = '0.35';
			labelsField.style.pointerEvents = 'none';
		}
		const labelsSelect = labelsField.createEl('select', { cls: 'tt-modal-select' });
		const labelDefinition = taskFields.find(f => f.name === 'labels')!;
		const labelOptions = getFieldOptions(labelDefinition, this.plugin.settings);
		labelsSelect.createEl('option', { text: '— none —', value: '' });
		for (const t of labelOptions as string[]) {
			labelsSelect.createEl('option', { text: t, value: t });
		}
		if (this.formValues.labels[0]) labelsSelect.value = this.formValues.labels[0];
		const applyLabelTint = () => {
			const selectedLabel = this.formValues.labels[0] ?? '';
			const color = selectedLabel ? this.labelColors[selectedLabel] : undefined;
			if (!color) {
				labelsSelect.style.removeProperty('background');
				labelsSelect.style.removeProperty('border-color');
				labelsSelect.style.removeProperty('color');
				return;
			}
			labelsSelect.style.background = `color-mix(in srgb, ${color} 10%, var(--background-primary))`;
			labelsSelect.style.borderColor = `color-mix(in srgb, ${color} 42%, var(--background-modifier-border))`;
			labelsSelect.style.color = color;
		};
		applyLabelTint();
		labelsSelect.addEventListener('change', () => {
			this.formValues.labels = labelsSelect.value ? [labelsSelect.value] : [];
			applyLabelTint();
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
		const depsChipsEl = afterTaskField.createDiv('tt-modal-chips');
		const afterTaskSelect = afterTaskField.createEl('select', { cls: 'tt-modal-select' });

		const renderDepsChips = () => {
			depsChipsEl.empty();
			for (const depPath of this.formValues.depends_on) {
				const depTask = this.plugin.taskStore.getByPath(depPath);
				const label = depTask?.name ?? depPath.split('/').pop() ?? depPath;
				const chip = depsChipsEl.createEl('span', { cls: 'tt-modal-chip tt-chip-active', text: label });
				const removeBtn = chip.createEl('span', { text: ' ×', cls: 'tt-modal-chip-remove' });
				removeBtn.addEventListener('click', () => {
					this.formValues.depends_on = this.formValues.depends_on.filter((d: string) => d !== depPath);
					renderDepsChips();
					renderAfterTaskOptions();
					if (this.formValues.depends_on.length === 0) {
						startDateInput.disabled = false;
						startTodayBtn.disabled = false;
					}
				});
			}
		};

		const renderAfterTaskOptions = () => {
			afterTaskSelect.empty();
			afterTaskSelect.createEl('option', { text: '+ Add dependency…', value: '' });
			const availableTasks = allTasks
				.filter(t => !this.formValues.depends_on.includes(t.path.replace(/\.md$/, '')))
				.sort((a, b) => sortDependencyFirst(a, b, this.formValues.parent_task));
			for (const t of availableTasks) {
				const path = t.path.replace(/\.md$/, '');
				afterTaskSelect.createEl('option', { text: t.name, value: path });
			}
		};

		renderAfterTaskOptions();
		renderDepsChips();

		// Disable start-date fields when deps are pre-filled
		if (this.formValues.depends_on.length > 0) {
			startDateInput.disabled = true;
			startTodayBtn.disabled = true;
		}

		startDateInput.addEventListener('change', () => {
			this.formValues.start_date = startDateInput.value;
			if (startDateInput.value) {
				this.formValues.depends_on = [];
				renderDepsChips();
				renderAfterTaskOptions();
				afterTaskSelect.disabled = true;
			} else {
				afterTaskSelect.disabled = false;
			}
		});

		startTodayBtn.addEventListener('click', () => {
			const today = localDateString();
			startDateInput.value = today;
			this.formValues.start_date = today;
			this.formValues.depends_on = [];
			renderDepsChips();
			renderAfterTaskOptions();
			afterTaskSelect.disabled = true;
		});

		startClearBtn.addEventListener('click', () => {
			startDateInput.value = '';
			this.formValues.start_date = '';
			afterTaskSelect.disabled = false;
		});

		afterTaskSelect.addEventListener('change', () => {
			const val = afterTaskSelect.value;
			if (!val) return;
			this.formValues.depends_on = [...this.formValues.depends_on, val];
			afterTaskSelect.value = '';
			renderDepsChips();
			renderAfterTaskOptions();
			this.formValues.start_date = '';
			startDateInput.value        = '';
			startDateInput.disabled     = true;
			startTodayBtn.disabled      = true;
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
			this.formValues.due_date = dueDateInput.value;
			if (dueDateInput.value) {
				this.formValues.estimated_days  = null;
				estInput.value       = '';
				estInput.disabled    = true;
			} else {
				estInput.disabled    = false;
			}
		});

		estInput.addEventListener('change', () => {
			const parsed = estInput.value ? parseFloat(estInput.value) : null;
			this.formValues.estimated_days = parsed !== null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
			if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
				estInput.value = '';
			}
			if (estInput.value) {
				this.formValues.due_date           = '';
				dueDateInput.value      = '';
				dueDateInput.disabled   = true;
				dueTodayBtn.disabled    = true;
			} else {
				dueDateInput.disabled   = false;
				dueTodayBtn.disabled    = false;
			}
		});

		dueTodayBtn.addEventListener('click', () => {
			const today = localDateString();
			dueDateInput.value = today;
			this.formValues.due_date = today;
			this.formValues.estimated_days = null;
			estInput.value = '';
			estInput.disabled = true;
		});

		dueClearBtn.addEventListener('click', () => {
			dueDateInput.value = '';
			this.formValues.due_date = '';
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
			if (!this.formValues.notes.trim()) {
				notesPreview.createDiv({ cls: 'tt-notes-empty', text: 'No notes yet — click to add.' });
				return;
			}
			await MarkdownRenderer.render(this.app, this.formValues.notes, notesPreview, this.plugin.manifest.id, this.notesRenderComponent);
		};

		const scheduleRenderNotes = () => {
			if (this.notesRenderFrame !== null) cancelAnimationFrame(this.notesRenderFrame);
			this.notesRenderFrame = requestAnimationFrame(() => {
				this.notesRenderFrame = null;
				void renderNotes();
			});
		};

		notesEl.addEventListener('input', () => {
			this.formValues.notes = notesEl.value;
			scheduleRenderNotes();
		});
		void renderNotes();

		// ── Repeats ─────────────────────────────────────────────────────────────
		const details = recurrenceSection.createDiv('tt-modal-details');

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
			this.formValues.recurrence = recurrenceSelect.value || null;
			recurrenceTypeSelect.style.display = this.formValues.recurrence ? '' : 'none';
		});
		recurrenceTypeSelect.addEventListener('change', () => {
			this.formValues.recurrence_type = recurrenceTypeSelect.value || null;
		});

		// ── Buttons ──────────────────────────────────────────────────────────────
		const btnRow = contentEl.createDiv('tt-modal-btn-row');
		btnRow.createEl('button', { text: 'Cancel', cls: 'tt-modal-btn' })
			.addEventListener('click', () => this.close());
		const primaryBtn = btnRow.createEl('button', { text: 'Create task', cls: 'tt-modal-btn tt-modal-btn-primary' });
		this.createBtnEl = primaryBtn;
		primaryBtn.disabled = !this.formValues.name.trim();
				primaryBtn.disabled = !this.formValues.name.trim();
		nameInput.addEventListener('input', () => {
			this.formValues.name = nameInput.value;
			primaryBtn.disabled = this.submitting || !this.formValues.name.trim();
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
		setIcon(toggle.createSpan({ cls: 'tt-modal-section-chevron' }), 'chevron-down');

		const body = section.createDiv('tt-modal-section-body');
		this.setSectionOpen(section, isOpenByDefault);
		toggle.addEventListener('click', () => {
			this.setSectionOpen(section, !section.hasClass('is-open'));
		});

		return body;
	}

	private applyOptionStyle(btn: HTMLButtonElement, value: string, field: any) {
		const color = getOptionColor(value, field, this.plugin.settings)
			?? (field.name === 'priority' ? PRIORITY_COLORS[value as TaskPriority] : undefined);
		if (!color) return;
		// Tint the surface and keep the color as text so any user-configured color
		// stays readable in both themes (never hardcode white on it).
		btn.style.background = `color-mix(in srgb, ${color} 18%, var(--background-primary))`;
		btn.style.borderColor = `color-mix(in srgb, ${color} 60%, var(--background-modifier-border))`;
		btn.style.boxShadow = `inset 0 0 0 1px color-mix(in srgb, ${color} 60%, transparent)`;
		btn.style.color = color;
	}

	private renderSingleSelectChipGroup(args: {
		container: HTMLElement;
		options: string[];
		selected: string;
		field: any;
		onSelect: (value: string) => void;
	}): void {
		const { container, options, selected, field, onSelect } = args;
		const buttons = new Map<string, HTMLButtonElement>();

		const setSelected = (nextSelected: string) => {
			buttons.forEach((button) => {
				button.removeClass('tt-chip-active');
				button.style.removeProperty('background');
				button.style.removeProperty('border-color');
				button.style.removeProperty('box-shadow');
				button.style.removeProperty('color');
			});

			const selectedButton = buttons.get(nextSelected);
			if (!selectedButton) return;
			selectedButton.addClass('tt-chip-active');
			this.applyOptionStyle(selectedButton, nextSelected, field);
		};

		for (const option of options) {
			const btn = container.createEl('button', {
				text: option,
				cls: 'tt-modal-chip',
			});
			buttons.set(option, btn);
			btn.addEventListener('click', () => {
				onSelect(option);
				setSelected(option);
			});
		}

		setSelected(selected);
	}

	// ── Submit ───────────────────────────────────────────────────────────────────

	private async submit(primaryBtn?: HTMLButtonElement) {
		if (this.submitting) return;
		const name = this.formValues.name.trim();
		if (!name) {
						new Notice(`${this.formValues.type === 'project' ? 'Project' : 'Task'} name is required.`);
			return;
		}
		const startDate = this.formValues.depends_on.length > 0 ? null : (this.formValues.start_date || null);
		const dueDate = this.formValues.estimated_days !== null ? null : (this.formValues.due_date || null);

		this.submitting = true;
		if (primaryBtn) {
			primaryBtn.disabled = true;
			primaryBtn.setText('Creating…');
		}
		try {
			const task = await this.plugin.taskStore.create({
				type:           this.formValues.type,
				name,
				area:           this.formValues.area || null,
				status:         this.formValues.status,
				priority:       this.formValues.priority,
				labels:         this.formValues.labels,
				due_time:       null,
				parent_task:    this.formValues.parent_task,
				depends_on:     this.formValues.depends_on,
				blocked_reason: '',
				assigned_to:    '',
				source:         '',
				start_date:     startDate,
				due_date:       dueDate,
				estimated_days:  this.formValues.estimated_days,
				workweek_only:   this.formValues.type === 'project' ? this.formValues.workweek_only === true : false,
				holiday_dates:   this.formValues.type === 'project' ? this.formValues.holiday_dates : [],
				created:         localDateString(),
				completed:       null,
				notes:           this.formValues.notes,
				recurrence:      this.formValues.recurrence,
				recurrence_type: this.formValues.recurrence_type,
			});
			this.close();
			await this.plugin.taskStore.openDetail(task.path);
		} catch (e) {
			console.error('[TTasks] Failed to create task:', e);
			new Notice('TTasks: Failed to create task — check console for details.');
		} finally {
			this.submitting = false;
			if (primaryBtn) {
				primaryBtn.disabled = !this.formValues.name.trim();
				primaryBtn.setText(this.formValues.type === 'project' ? 'Create project' : 'Create task');
			}
		}
	}

	private parseHolidayDates(raw: string): string[] {
		const seen = new Set<string>();
		for (const part of raw.split(',')) {
			const trimmed = part.trim();
			if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) continue;
			seen.add(trimmed);
		}
		return [...seen].sort();
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
