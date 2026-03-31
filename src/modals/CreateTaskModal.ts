import { App, Modal, Notice, Setting } from 'obsidian';
import type TTasksPlugin from '../main';
import type { TaskPriority, TaskRecordType, TaskStatus, TaskType } from '../types';

const STATUSES: TaskStatus[]           = ['Active', 'In Progress', 'Future', 'Hold', 'Blocked', 'Cancelled', 'Done'];
const PRIORITIES: TaskPriority[]       = ['None', 'Low', 'Medium', 'High'];
const CATEGORIES                       = ['', 'database', 'general'];
const TASK_TYPES: (TaskType | '')[]    = ['', 'feature', 'bug', 'research', 'docs', 'action'];

export class CreateTaskModal extends Modal {
	private plugin: TTasksPlugin;

	private name           = '';
	private type: TaskRecordType   = 'task';
	private status: TaskStatus     = 'Active';
	private priority: TaskPriority = 'None';
	private category               = '';
	private task_type: TaskType | null = null;
	private due_date               = '';
	private start_date             = '';
	private estimated_days: number | null = null;
	private notes                  = '';

	constructor(app: App, plugin: TTasksPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass('tt-modal');
		contentEl.createEl('h2', { text: 'New Task' });

		// ── Name ────────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName('Name')
			.addText(text => {
				text.setPlaceholder('Task name').onChange(v => { this.name = v; });
				text.inputEl.focus();
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') { e.preventDefault(); void this.submit(); }
				});
			});

		// ── Type ────────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName('Type')
			.addDropdown(dd => {
				dd.addOption('task', 'Task')
				  .addOption('project', 'Project')
				  .setValue('task')
				  .onChange(v => {
					  this.type = v as TaskRecordType;
					  taskTypeRow.settingEl.style.display = v === 'project' ? 'none' : '';
				  });
			});

		// ── Status ──────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName('Status')
			.addDropdown(dd => {
				for (const s of STATUSES) dd.addOption(s, s);
				dd.setValue('Active').onChange(v => { this.status = v as TaskStatus; });
			});

		// ── Priority ────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName('Priority')
			.addDropdown(dd => {
				for (const p of PRIORITIES) dd.addOption(p, p);
				dd.setValue('None').onChange(v => { this.priority = v as TaskPriority; });
			});

		// ── Category ────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.setName('Category')
			.addDropdown(dd => {
				for (const c of CATEGORIES) dd.addOption(c, c || '— none —');
				dd.onChange(v => { this.category = v; });
			});

		// ── Task Type (hidden when type = project) ───────────────────────────────
		const taskTypeRow = new Setting(contentEl)
			.setName('Task Type')
			.addDropdown(dd => {
				for (const t of TASK_TYPES) dd.addOption(t, t || '— none —');
				dd.onChange(v => { this.task_type = (v as TaskType) || null; });
			});

		// ── More options (collapsible) ───────────────────────────────────────────
		const details = contentEl.createEl('details', { cls: 'tt-modal-details' });
		details.createEl('summary', { text: 'More options', cls: 'tt-modal-summary' });

		new Setting(details)
			.setName('Due Date')
			.addText(text => {
				text.inputEl.type = 'date';
				text.onChange(v => { this.due_date = v; });
			});

		new Setting(details)
			.setName('Start Date')
			.addText(text => {
				text.inputEl.type = 'date';
				text.onChange(v => { this.start_date = v; });
			});

		new Setting(details)
			.setName('Est. Days')
			.addText(text => {
				text.inputEl.type = 'number';
				text.inputEl.min = '0';
				text.inputEl.step = '0.5';
				text.onChange(v => { this.estimated_days = v ? parseFloat(v) : null; });
			});

		const notesSetting = new Setting(details).setName('Notes');
		const notesEl = notesSetting.controlEl.createEl('textarea', {
			cls: 'tt-modal-notes',
			attr: { rows: '4', placeholder: 'Add notes…' },
		});
		notesEl.addEventListener('input', () => { this.notes = notesEl.value; });

		// ── Buttons ─────────────────────────────────────────────────────────────
		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('Create').setCta().onClick(() => void this.submit()))
			.addButton(btn => btn.setButtonText('Cancel').onClick(() => this.close()));
	}

	private async submit() {
		const name = this.name.trim();
		if (!name) {
			new Notice('Task name is required.');
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
				depends_on:     [],
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
			new Notice(`Failed to create task: ${e}`);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
