import { App, Modal, Notice } from 'obsidian';
import { get } from 'svelte/store';
import type TTasksPlugin from '../main';
import type { TaskPriority, TaskRecordType, TaskStatus, TaskType } from '../types';
import { resolveEmergencyStatus } from '../settings';

const PRIORITIES: TaskPriority[]    = ['None', 'Low', 'Medium', 'High'];

const PRIORITY_COLORS: Record<TaskPriority, string> = {
	High:   'var(--color-red)',
	Medium: 'var(--color-orange)',
	Low:    'var(--color-blue)',
	None:   'var(--text-faint)',
};

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
		contentEl.addClass('tt-modal');
		this.modalEl.addClass('tt-create-modal');

		// ── Name ────────────────────────────────────────────────────────────────
		const nameInput = contentEl.createEl('input', {
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

		// ── Type — full-width segmented ──────────────────────────────────────────
		const typeGroup = contentEl.createDiv('tt-modal-type-group');
		const taskTypeField = this.field(contentEl, 'Task Type');

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
		const priorityField = this.field(contentEl, 'Priority');
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

		// ── Task Type chips (grayed out for project) ────────────────────────────
		if (this.type === 'project') {
			taskTypeField.style.opacity       = '0.35';
			taskTypeField.style.pointerEvents = 'none';
		}
		const taskTypeChips = taskTypeField.createDiv('tt-modal-chips');

		for (const t of this.taskTypes) {
			const btn = taskTypeChips.createEl('button', {
				text: t || '— none —',
				cls: `tt-modal-chip${!t ? ' tt-chip-active' : ''}`,
			});
			if (t && this.taskTypeColors[t]) {
				btn.style.borderColor = this.taskTypeColors[t];
				btn.style.color = this.taskTypeColors[t];
			}
			btn.addEventListener('click', () => {
				this.task_type = (t as TaskType) || null;
				taskTypeChips.querySelectorAll<HTMLButtonElement>('.tt-modal-chip').forEach(b => {
					b.removeClass('tt-chip-active');
					b.style.removeProperty('background');
					if (b.textContent && this.taskTypeColors[b.textContent]) {
						b.style.borderColor = this.taskTypeColors[b.textContent];
						b.style.color = this.taskTypeColors[b.textContent];
					} else {
						b.style.removeProperty('border-color');
						b.style.removeProperty('color');
					}
				});
				btn.addClass('tt-chip-active');
				if (t && this.taskTypeColors[t]) {
					btn.style.background = `color-mix(in srgb, ${this.taskTypeColors[t]} 18%, var(--background-primary))`;
					btn.style.borderColor = this.taskTypeColors[t];
					btn.style.color = this.taskTypeColors[t];
				}
			});
		}

		// ── Start Date | After Task (mutually exclusive) ─────────────────────────
		const startRow = contentEl.createDiv('tt-modal-pair-row');

		const startDateField = this.field(startRow, 'Start Date');
		const startDateInput = startDateField.createEl('input', {
			cls: 'tt-modal-input',
			attr: { type: 'date' },
		});

		const afterTaskField = this.field(startRow, 'After Task');
		const allTasks = get(this.plugin.taskStore.tasks);
		const afterTaskSelect = afterTaskField.createEl('select', { cls: 'tt-modal-select' });
		afterTaskSelect.createEl('option', { text: '— none —', value: '' });
		for (const t of allTasks) {
			afterTaskSelect.createEl('option', { text: t.name, value: t.path.replace(/\.md$/, '') });
		}

		startDateInput.addEventListener('change', () => {
			this.start_date = startDateInput.value;
			if (startDateInput.value) {
				this.depends_on = [];
				afterTaskSelect.value    = '';
				afterTaskSelect.disabled = true;
			} else {
				afterTaskSelect.disabled = false;
			}
		});

		afterTaskSelect.addEventListener('change', () => {
			const val = afterTaskSelect.value;
			this.depends_on = val ? [val] : [];
			if (val) {
				this.start_date          = '';
				startDateInput.value     = '';
				startDateInput.disabled  = true;
			} else {
				startDateInput.disabled  = false;
			}
		});

		// ── Due Date | Est. Days (mutually exclusive) ────────────────────────────
		const dueRow = contentEl.createDiv('tt-modal-pair-row');

		const dueDateField = this.field(dueRow, 'Due Date');
		const dueDateInput = dueDateField.createEl('input', {
			cls: 'tt-modal-input',
			attr: { type: 'date' },
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
			this.estimated_days = estInput.value ? parseFloat(estInput.value) : null;
			if (estInput.value) {
				this.due_date           = '';
				dueDateInput.value      = '';
				dueDateInput.disabled   = true;
			} else {
				dueDateInput.disabled   = false;
			}
		});

		// ── Notes ────────────────────────────────────────────────────────────────
		const notesField = this.field(contentEl, 'Notes');
		const notesEl = notesField.createEl('textarea', {
			cls: 'tt-modal-textarea',
			attr: { rows: '3', placeholder: 'Add notes…' },
		});
		notesEl.addEventListener('input', () => { this.notes = notesEl.value; });

		// ── More options (Status + Category) ────────────────────────────────────
		const details = contentEl.createEl('details', { cls: 'tt-modal-details' });
		details.createEl('summary', { text: 'More options', cls: 'tt-modal-summary' });

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

		// ── Buttons ──────────────────────────────────────────────────────────────
		const btnRow = contentEl.createDiv('tt-modal-btn-row');
		btnRow.createEl('button', { text: 'Cancel', cls: 'tt-modal-btn' })
			.addEventListener('click', () => this.close());
		btnRow.createEl('button', { text: 'Create task', cls: 'tt-modal-btn tt-modal-btn-primary' })
			.addEventListener('click', () => void this.submit());
	}

	// ── Helpers ──────────────────────────────────────────────────────────────────

	private field(parent: HTMLElement, label: string): HTMLElement {
		const wrap = parent.createDiv('tt-modal-field');
		wrap.createEl('label', { text: label, cls: 'tt-modal-label' });
		return wrap;
	}

	private applyPriorityStyle(btn: HTMLButtonElement, p: TaskPriority) {
		btn.style.background  = PRIORITY_COLORS[p];
		btn.style.borderColor = PRIORITY_COLORS[p];
		btn.style.color       = '#fff';
	}

	// ── Submit ───────────────────────────────────────────────────────────────────

	private async submit() {
		const name = this.name.trim();
		if (!name) {
			new Notice(`${this.type === 'project' ? 'Project' : 'Task'} name is required.`);
			return;
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
				start_date:     this.start_date || null,
				due_date:       this.due_date   || null,
				estimated_days: this.estimated_days,
				created:        new Date().toISOString().slice(0, 10),
				completed:      null,
				notes:          this.notes,
			});
			this.close();
			await this.plugin.taskStore.openDetail(task.path);
		} catch (e) {
			console.error('[TTasks] Failed to create task:', e);
			new Notice('TTasks: Failed to create task — check console for details.');
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
