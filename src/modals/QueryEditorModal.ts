import { App, Modal, Notice, Setting } from 'obsidian';
import type { FilterCondition, FilterField, FilterGroup, FilterOperator, QuerySpec, SortEntry, SortField } from '../query/types';
import type { TaskViewRenderer } from '../settings';
import {
	FILTER_FIELDS,
	GROUP_FIELDS,
	SORT_FIELDS,
	emptyFilterCondition,
	emptyFilterGroup,
	operatorsForField,
	parseQuerySpecFromJson,
	selectOptionsForField,
	valueInputKind,
} from '../query/queryEditor';

const MAX_FILTER_NESTING = 3;

// ── Human-readable field labels ───────────────────────────────────────────────

const FILTER_FIELD_LABELS: Record<FilterField, string> = {
	area: 'Area', status: 'Status', priority: 'Priority', labels: 'Labels', type: 'Type',
	due_date: 'Due date', due_time: 'Due time', start_date: 'Start date', created: 'Created',
	is_complete: 'Is complete', is_inbox: 'Is inbox',
	parent_task: 'Parent task', depends_on: 'Depends on', blocks: 'Blocks',
	assigned_to: 'Assigned to',
};

const SORT_FIELD_LABELS: Record<SortField, string> = {
	name: 'Name', due_date: 'Due date', due_time: 'Due time', start_date: 'Start date',
	created: 'Created', priority: 'Priority', status: 'Status', area: 'Area', type: 'Type',
};

const OPERATOR_LABELS: Record<FilterOperator, string> = {
	is: 'is', is_not: 'is not',
	contains: 'contains', not_contains: 'does not contain',
	contains_any: 'contains any of', contains_all: 'contains all of',
	before: 'before', after: 'after', within_days: 'within days',
	is_null: 'is empty', is_not_null: 'is not empty',
};

const GROUP_FIELD_LABELS: Record<string, string> = {
	status: 'Status', area: 'Area', priority: 'Priority', type: 'Type',
	due_date: 'Due date', parent_task: 'Parent task',
};

// ── QueryEditorModal ──────────────────────────────────────────────────────────

export class QueryEditorModal extends Modal {
	private query: QuerySpec;
	private renderer: TaskViewRenderer;
	private readonly viewName: string;
	private readonly settings: { statuses?: string[]; areas?: string[]; labelValues?: string[] };
	private readonly onSave: (query: QuerySpec, renderer: TaskViewRenderer) => void | Promise<void>;

	/** Tracks which tab is active. */
	private activeTab: 'builder' | 'json' = 'builder';
	/** Raw JSON draft (only used while on JSON tab). */
	private jsonDraft = '';

	constructor(
		app: App,
		viewName: string,
		query: QuerySpec,
		renderer: TaskViewRenderer,
		settings: { statuses?: string[]; areas?: string[]; labelValues?: string[] },
		onSave: (query: QuerySpec, renderer: TaskViewRenderer) => void | Promise<void>,
	) {
		super(app);
		this.viewName = viewName;
		this.query = JSON.parse(JSON.stringify(query)) as QuerySpec; // deep clone
		this.renderer = renderer;
		this.settings = settings;
		this.onSave = onSave;
	}

	onOpen() {
		this.modalEl.addClass('tt-query-editor-modal');
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	// ── Top-level render ────────────────────────────────────────────────────

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: `Edit query: ${this.viewName}` });

		// Tab bar
		const tabBar = contentEl.createDiv({ cls: 'tt-qe-tabs' });
		const builderBtn = tabBar.createEl('button', { text: 'Builder', cls: 'tt-qe-tab' });
		const jsonBtn = tabBar.createEl('button', { text: 'JSON', cls: 'tt-qe-tab' });
		if (this.activeTab === 'builder') builderBtn.addClass('is-active');
		else jsonBtn.addClass('is-active');

		builderBtn.addEventListener('click', () => {
			this.activeTab = 'builder';
			this.render();
		});
		jsonBtn.addEventListener('click', () => {
			this.jsonDraft = JSON.stringify(this.query, null, 2);
			this.activeTab = 'json';
			this.render();
		});

		// Tab content
		const body = contentEl.createDiv({ cls: 'tt-qe-body' });
		if (this.activeTab === 'builder') {
			this.renderBuilder(body);
		} else {
			this.renderJsonTab(body);
		}

		// Footer
		const footer = contentEl.createDiv({ cls: 'tt-qe-footer' });
		const cancelBtn = footer.createEl('button', { text: 'Cancel', cls: 'tt-qe-cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = footer.createEl('button', { text: 'Save', cls: 'mod-cta tt-qe-save' });
		saveBtn.addEventListener('click', () => this.save());
	}

	// ── Builder tab ─────────────────────────────────────────────────────────

	private renderBuilder(container: HTMLElement) {
		this.renderViewTypeSection(container);
		this.renderFilterSection(container);
		this.renderSortSection(container);
		this.renderGroupSection(container);
		this.renderLimitSection(container);
	}

	private renderViewTypeSection(container: HTMLElement) {
		const section = container.createDiv({ cls: 'tt-qe-section' });
		section.createEl('h3', { text: 'View Type' });

		new Setting(section)
			.setName('Renderer')
			.setDesc('Choose how this Smart List is displayed in the board.')
			.addDropdown((dropdown) => {
				dropdown.addOption('list', 'List');
				dropdown.addOption('kanban', 'Kanban');
				dropdown.addOption('agenda', 'Agenda');
				dropdown.addOption('graph', 'Graph');
				dropdown.setValue(this.renderer);
				dropdown.onChange((value) => {
					this.renderer = value as TaskViewRenderer;
				});
			});
	}

	// ── Filter section ──────────────────────────────────────────────────────

	private renderFilterSection(container: HTMLElement) {
		const section = container.createDiv({ cls: 'tt-qe-section' });
		section.createEl('h3', { text: 'Filters' });

		this.renderFilterGroup(section, this.query.filter, (updated) => {
			this.query = { ...this.query, filter: updated };
		}, 1);
	}

	private renderFilterGroup(
		container: HTMLElement,
		group: FilterGroup,
		onChange: (updated: FilterGroup) => void,
		depth: number,
	) {
		const groupEl = container.createDiv({ cls: 'tt-qe-filter-group' });

		// Logic row
		const logicRow = groupEl.createDiv({ cls: 'tt-qe-logic-row' });
		logicRow.createSpan({ text: 'Match ', cls: 'tt-qe-label' });
		const logicSel = logicRow.createEl('select', { cls: 'dropdown' });
		(['and', 'or'] as const).forEach((opt) => {
			const o = logicSel.createEl('option', { text: opt === 'and' ? 'ALL conditions (AND)' : 'ANY condition (OR)', value: opt });
			if (group.logic === opt) o.selected = true;
		});
		logicSel.addEventListener('change', () => {
			onChange({ ...group, logic: logicSel.value as 'and' | 'or' });
			this.query.filter = group.logic === this.query.filter.logic ? { ...this.query.filter, logic: logicSel.value as 'and' | 'or' } : this.query.filter;
			this.renderConditionsOnly(conditionsContainer, group, onChange, depth);
		});

		const conditionsContainer = groupEl.createDiv({ cls: 'tt-qe-conditions' });
		this.renderConditionsOnly(conditionsContainer, group, onChange, depth);

		// Add condition button
		const addRow = groupEl.createDiv({ cls: 'tt-qe-add-row' });
		const addCondBtn = addRow.createEl('button', { text: '+ Add condition', cls: 'tt-qe-add-btn' });
		addCondBtn.addEventListener('click', () => {
			const updated: FilterGroup = {
				...group,
				conditions: [...group.conditions, emptyFilterCondition()],
			};
			onChange(updated);
			// Re-sync local reference and re-render conditions
			group.conditions = updated.conditions;
			conditionsContainer.empty();
			this.renderConditionsOnly(conditionsContainer, group, onChange, depth);
		});

		// Add group button (cap at MAX_FILTER_NESTING)
		if (depth < MAX_FILTER_NESTING) {
			const addGroupBtn = addRow.createEl('button', { text: '+ Add group', cls: 'tt-qe-add-btn' });
			addGroupBtn.addEventListener('click', () => {
				const updated: FilterGroup = {
					...group,
					conditions: [...group.conditions, emptyFilterGroup()],
				};
				onChange(updated);
				group.conditions = updated.conditions;
				conditionsContainer.empty();
				this.renderConditionsOnly(conditionsContainer, group, onChange, depth);
			});
		}
	}

	private renderConditionsOnly(
		container: HTMLElement,
		group: FilterGroup,
		onChange: (updated: FilterGroup) => void,
		depth: number,
	) {
		container.empty();
		group.conditions.forEach((item, index) => {
			if ('logic' in item) {
				// Sub-group
				const subGroup = item as FilterGroup;
				this.renderFilterGroup(container, subGroup, (updated) => {
					const newConditions = [...group.conditions];
					newConditions[index] = updated;
					const updatedGroup = { ...group, conditions: newConditions };
					group.conditions = updatedGroup.conditions;
					onChange(updatedGroup);
				}, depth + 1);
			} else {
				// Condition row
				this.renderConditionRow(container, item as FilterCondition, index, group, onChange);
			}
		});
	}

	private renderConditionRow(
		container: HTMLElement,
		condition: FilterCondition,
		index: number,
		group: FilterGroup,
		onChange: (updated: FilterGroup) => void,
	) {
		const row = container.createDiv({ cls: 'tt-qe-condition-row' });

		// Field selector
		const fieldSel = row.createEl('select', { cls: 'dropdown tt-qe-field' });
		for (const f of FILTER_FIELDS) {
			const o = fieldSel.createEl('option', { text: FILTER_FIELD_LABELS[f] ?? f, value: f });
			if (f === condition.field) o.selected = true;
		}

		// Operator selector
		const opSel = row.createEl('select', { cls: 'dropdown tt-qe-op' });
		const rebuildOpSel = (field: FilterField, currentOp: FilterOperator) => {
			opSel.empty();
			for (const op of operatorsForField(field)) {
				const o = opSel.createEl('option', { text: OPERATOR_LABELS[op] ?? op, value: op });
				if (op === currentOp) o.selected = true;
			}
		};
		rebuildOpSel(condition.field, condition.operator);

		// Value input area
		const valueArea = row.createDiv({ cls: 'tt-qe-value' });
		const rebuildValueInput = (field: FilterField, op: FilterOperator, current: unknown) => {
			valueArea.empty();
			const kind = valueInputKind(field, op);
			if (kind === 'none') return;

			if (kind === 'select') {
				const opts = selectOptionsForField(field, this.settings);
				if (opts.length > 0) {
					const sel = valueArea.createEl('select', { cls: 'dropdown' });
					for (const opt of opts) {
						const o = sel.createEl('option', { text: opt, value: opt });
						if (opt === String(current ?? '')) o.selected = true;
					}
					sel.addEventListener('change', () => updateCondition(field, op, sel.value));
					return;
				}
			}

			const input = valueArea.createEl('input', {
				type: kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text',
				cls: 'tt-qe-input',
				value: current !== undefined && current !== null ? String(current) : '',
			});
			input.placeholder = kind === 'date' ? 'YYYY-MM-DD or today, +7d …' : kind === 'number' ? 'Days' : '';
			input.addEventListener('input', () => {
				const v = kind === 'number' ? Number(input.value) : input.value;
				updateCondition(field, op, v);
			});
		};

		const updateCondition = (field: FilterField, op: FilterOperator, value: unknown) => {
			const newCond: FilterCondition = { field, operator: op, value: value as FilterCondition['value'] };
			const newConditions = [...group.conditions];
			newConditions[index] = newCond;
			const updatedGroup = { ...group, conditions: newConditions };
			group.conditions = updatedGroup.conditions;
			onChange(updatedGroup);
		};

		rebuildValueInput(condition.field, condition.operator, condition.value);

		// Wire field → operator rebuild
		fieldSel.addEventListener('change', () => {
			const field = fieldSel.value as FilterField;
			const newOps = operatorsForField(field);
			const newOp = newOps[0];
			rebuildOpSel(field, newOp);
			rebuildValueInput(field, newOp, '');
			updateCondition(field, newOp, '');
		});

		// Wire op → value rebuild
		opSel.addEventListener('change', () => {
			const field = fieldSel.value as FilterField;
			const op = opSel.value as FilterOperator;
			rebuildValueInput(field, op, condition.value);
			updateCondition(field, op, condition.value);
		});

		// Delete button
		const delBtn = row.createEl('button', { cls: 'tt-qe-del clickable-icon', attr: { 'aria-label': 'Remove condition' } });
		delBtn.innerHTML = '✕';
		delBtn.addEventListener('click', () => {
			const newConditions = group.conditions.filter((_, i) => i !== index);
			const updatedGroup = { ...group, conditions: newConditions };
			group.conditions = updatedGroup.conditions;
			onChange(updatedGroup);
			row.remove();
		});
	}

	// ── Sort section ────────────────────────────────────────────────────────

	private renderSortSection(container: HTMLElement) {
		const section = container.createDiv({ cls: 'tt-qe-section' });
		section.createEl('h3', { text: 'Sort' });

		new Setting(section)
			.setName('Sort behavior')
			.setDesc('Choose whether sort runs globally before grouping, or within each group after grouping.')
			.addDropdown((dropdown) => {
				dropdown.addOption('within_groups', 'Within groups');
				dropdown.addOption('global', 'Global before grouping');
				dropdown.setValue(this.query.sortScope ?? (this.query.group.kind === 'none' ? 'global' : 'within_groups'));
				dropdown.onChange((value) => {
					this.query = { ...this.query, sortScope: value as 'global' | 'within_groups' };
				});
			});

		const list = section.createDiv({ cls: 'tt-qe-sort-list' });
		const renderList = () => {
			list.empty();
			this.query.sort.forEach((entry, index) => {
				const row = list.createDiv({ cls: 'tt-qe-sort-row' });

				const fieldSel = row.createEl('select', { cls: 'dropdown' });
				for (const f of SORT_FIELDS) {
					const o = fieldSel.createEl('option', { text: SORT_FIELD_LABELS[f] ?? f, value: f });
					if (f === entry.field) o.selected = true;
				}
				fieldSel.addEventListener('change', () => {
					this.query.sort[index] = { ...this.query.sort[index], field: fieldSel.value as SortField };
				});

				const dirSel = row.createEl('select', { cls: 'dropdown' });
				['asc', 'desc'].forEach((dir) => {
					const o = dirSel.createEl('option', { text: dir === 'asc' ? 'Ascending' : 'Descending', value: dir });
					if (dir === entry.direction) o.selected = true;
				});
				dirSel.addEventListener('change', () => {
					this.query.sort[index] = { ...this.query.sort[index], direction: dirSel.value as SortEntry['direction'] };
				});

				const delBtn = row.createEl('button', { cls: 'tt-qe-del clickable-icon', attr: { 'aria-label': 'Remove sort' } });
				delBtn.innerHTML = '✕';
				delBtn.addEventListener('click', () => {
					this.query = { ...this.query, sort: this.query.sort.filter((_, i) => i !== index) };
					renderList();
				});
			});
		};
		renderList();

		const addBtn = section.createEl('button', { text: '+ Add sort', cls: 'tt-qe-add-btn' });
		addBtn.addEventListener('click', () => {
			this.query = { ...this.query, sort: [...this.query.sort, { field: 'due_date', direction: 'asc' }] };
			renderList();
		});
	}

	// ── Group section ───────────────────────────────────────────────────────

	private renderGroupSection(container: HTMLElement) {
		const section = container.createDiv({ cls: 'tt-qe-section' });
		section.createEl('h3', { text: 'Group by' });

		const renderGroupControls = () => {
			groupBody.empty();

			const typeSel = groupBody.createEl('select', { cls: 'dropdown' });
			const opts: Array<{ value: string; label: string }> = [
				{ value: 'none', label: 'None (no grouping)' },
				...GROUP_FIELDS.map((f) => ({ value: `field:${f}`, label: GROUP_FIELD_LABELS[f] ?? f })),
				{ value: 'date_buckets:agenda', label: 'Agenda date buckets' },
			];
			let currentValue = 'none';
			if (this.query.group.kind === 'field') currentValue = `field:${this.query.group.field}`;
			else if (this.query.group.kind === 'date_buckets') currentValue = 'date_buckets:agenda';

			for (const opt of opts) {
				const o = typeSel.createEl('option', { text: opt.label, value: opt.value });
				if (opt.value === currentValue) o.selected = true;
			}
			typeSel.addEventListener('change', () => {
				const v = typeSel.value;
				if (v === 'none') {
					this.query = { ...this.query, group: { kind: 'none' } };
				} else if (v.startsWith('field:')) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					this.query = { ...this.query, group: { kind: 'field', field: v.slice(6) as any } };
				} else if (v === 'date_buckets:agenda') {
					this.query = { ...this.query, group: { kind: 'date_buckets', field: 'due_date', preset: 'agenda' } };
				}
			});
		};

		const groupBody = section.createDiv();
		renderGroupControls();
	}

	// ── Limit section ───────────────────────────────────────────────────────

	private renderLimitSection(container: HTMLElement) {
		const section = container.createDiv({ cls: 'tt-qe-section' });
		section.createEl('h3', { text: 'Limits' });

		new Setting(section)
			.setName('Limit total results')
			.setDesc('Cap total results after sort. Leave empty for no limit.')
			.addText((text) => {
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.setValue(this.query.limit !== undefined ? String(this.query.limit) : '');
				text.onChange((v) => {
					const n = parseInt(v, 10);
					this.query = { ...this.query, limit: isNaN(n) || n < 1 ? undefined : n };
				});
			});

		new Setting(section)
			.setName('Limit per group')
			.setDesc('Cap results per group. Only applies when a group is set.')
			.addText((text) => {
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.setValue(this.query.limitPerGroup !== undefined ? String(this.query.limitPerGroup) : '');
				text.onChange((v) => {
					const n = parseInt(v, 10);
					this.query = { ...this.query, limitPerGroup: isNaN(n) || n < 1 ? undefined : n };
				});
			});

		new Setting(section)
			.setName('Search')
			.setDesc('Pre-filter full-text match on task name and notes.')
			.addText((text) => {
				text.setValue(this.query.search ?? '');
				text.onChange((v) => {
					this.query = { ...this.query, search: v.trim() || undefined };
				});
			});
	}

	// ── JSON tab ─────────────────────────────────────────────────────────────

	private renderJsonTab(container: HTMLElement) {
		const desc = container.createEl('p', {
			cls: 'setting-item-description',
			text: 'Edit the raw QuerySpec JSON directly. Use this for complex filters beyond what the builder supports. The builder will reflect your changes when you switch tabs.',
		});
		desc.style.marginBottom = '8px';

		const errEl = container.createDiv({ cls: 'tt-qe-json-error' });
		errEl.style.display = 'none';

		const ta = container.createEl('textarea', { cls: 'tt-qe-json-area' });
		ta.value = this.jsonDraft || JSON.stringify(this.query, null, 2);
		ta.rows = 20;

		ta.addEventListener('input', () => {
			this.jsonDraft = ta.value;
			errEl.style.display = 'none';
			errEl.textContent = '';
		});

		const formatBtn = container.createEl('button', { text: 'Format JSON', cls: 'tt-qe-add-btn' });
		formatBtn.style.marginTop = '8px';
		formatBtn.addEventListener('click', () => {
			const result = parseQuerySpecFromJson(ta.value);
			if (result.ok) {
				ta.value = JSON.stringify(result.value, null, 2);
				this.jsonDraft = ta.value;
				errEl.style.display = 'none';
			} else {
				errEl.textContent = result.error;
				errEl.style.display = 'block';
			}
		});
	}

	// ── Save ─────────────────────────────────────────────────────────────────

	private async save() {
		if (this.activeTab === 'json') {
			const result = parseQuerySpecFromJson(this.jsonDraft || JSON.stringify(this.query));
			if (!result.ok) {
				new Notice(`Cannot save: ${result.error}`);
				return;
			}
			this.query = result.value;
		}
		await this.onSave(this.query, this.renderer);
		this.close();
	}
}
