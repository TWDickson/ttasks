import { FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type { App } from 'obsidian';
import type { Task } from '../types';
import { PRIORITY_COLORS } from '../constants';

/**
 * "Jump to task" navigator — fuzzy-matches over task names (with area/labels
 * as secondary match text) and hands the chosen task to the caller. Unlike
 * TaskLinkSuggestModal this relies on Obsidian's native fuzzy scoring so
 * typo-tolerant queries and protocol prefill both work.
 */
export class TaskJumpSuggestModal extends FuzzySuggestModal<Task> {
	private readonly allTasks: Task[];
	private readonly onSelect: (task: Task) => void;
	private readonly initialQuery: string;

	constructor(app: App, tasks: Task[], onSelect: (task: Task) => void, initialQuery = '', placeholder = 'Jump to task...') {
		super(app);
		this.allTasks = [...tasks];
		this.onSelect = onSelect;
		this.initialQuery = initialQuery;
		this.setPlaceholder(placeholder);
	}

	onOpen(): void {
		super.onOpen();
		if (this.initialQuery) {
			this.inputEl.value = this.initialQuery;
			this.inputEl.dispatchEvent(new Event('input'));
		}
	}

	getItems(): Task[] {
		return [...this.allTasks].sort((a, b) => a.name.localeCompare(b.name));
	}

	getItemText(item: Task): string {
		// Name first so it dominates fuzzy ranking; area/labels let queries
		// like "roof home" still find the task.
		return [item.name, item.area ?? '', ...item.labels].join(' ').trim();
	}

	renderSuggestion(match: FuzzyMatch<Task>, el: HTMLElement): void {
		const task = match.item;
		el.addClass('tt-jump-suggest-item');

		const main = el.createDiv({ cls: 'tt-jump-suggest-main' });
		const dot = main.createSpan({ cls: 'tt-priority-dot' });
		if (task.priority === 'None') dot.addClass('is-none');
		dot.style.background = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.None;
		dot.title = `Priority: ${task.priority}`;
		main.createSpan({ text: task.name, cls: 'tt-jump-suggest-title' });

		const meta = [task.status, task.area].filter(Boolean).join(' · ');
		if (meta) el.createDiv({ text: meta, cls: 'tt-jump-suggest-meta' });
	}

	onChooseItem(item: Task): void {
		this.onSelect(item);
	}
}
