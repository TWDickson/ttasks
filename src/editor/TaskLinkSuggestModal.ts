import { FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type { App } from 'obsidian';
import type { Task } from '../types';
import { filterTaskSuggestions } from '../integration/editorAssist';

export class TaskLinkSuggestModal extends FuzzySuggestModal<Task> {
	private readonly allTasks: Task[];
	private readonly onSelect: (task: Task) => void;

	constructor(app: App, tasks: Task[], onSelect: (task: Task) => void) {
		super(app);
		this.allTasks = [...tasks];
		this.onSelect = onSelect;
		this.setPlaceholder('Search tasks to insert link...');
	}

	getItems(): Task[] {
		return [...this.allTasks].sort((a, b) => a.name.localeCompare(b.name));
	}

	getSuggestions(query: string) {
		const filtered = filterTaskSuggestions(query, this.allTasks);
		return filtered.map((task) => ({
			item: task,
			match: { score: 0, matches: [] },
		}));
	}

	getItemText(item: Task): string {
		return item.name;
	}

	renderSuggestion(match: FuzzyMatch<Task>, el: HTMLElement): void {
		const task = match.item;
		el.addClass('tt-link-suggest-item');
		el.createDiv({ text: task.name, cls: 'tt-link-suggest-title' });
		el.createDiv({ text: task.path, cls: 'tt-link-suggest-path' });
	}

	onChooseItem(item: Task): void {
		this.onSelect(item);
	}
}
