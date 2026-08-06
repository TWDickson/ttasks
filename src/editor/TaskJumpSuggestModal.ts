import { FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type { App } from 'obsidian';
import type { Task } from '../types';
import { priorityColor } from '../constants';
import { parseSearchTerm } from '../query/hashSearch';

/**
 * Wrap an exact (non-fuzzy) hit in the FuzzyMatch shape the modal expects.
 * `matches` is empty because there are no name ranges to highlight — the hit
 * came from the id, and `renderSuggestion` draws the name unhighlighted anyway.
 */
function asExactMatch(item: Task): FuzzyMatch<Task> {
	return { item, match: { score: 0, matches: [] } };
}

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

	/**
	 * Hash-prefix search, layered over Obsidian's fuzzy scoring.
	 *
	 * The id is deliberately kept out of `getItemText`: fuzzy matching is
	 * subsequence-based, so folding six hex characters into the match text
	 * would let a query like "ace" hit ids it has no business hitting. Instead
	 * a hash query is resolved by exact prefix here, and those hits are placed
	 * ahead of the ordinary fuzzy results.
	 */
	getSuggestions(query: string): FuzzyMatch<Task>[] {
		const term = parseSearchTerm(query);
		if (!term?.idPrefix) return super.getSuggestions(query);

		const prefix = term.idPrefix;
		const hits = this.getItems().filter(t => t.id.toLowerCase().startsWith(prefix));

		// The `#` sigil means "id only" — never fall through to name matching.
		if (term.idOnly) return hits.map(item => asExactMatch(item));
		if (hits.length === 0) return super.getSuggestions(query);

		const seen = new Set(hits.map(t => t.path));
		const fuzzy = super.getSuggestions(query).filter(m => !seen.has(m.item.path));
		return [...hits.map(item => asExactMatch(item)), ...fuzzy];
	}

	renderSuggestion(match: FuzzyMatch<Task>, el: HTMLElement): void {
		const task = match.item;
		el.addClass('tt-jump-suggest-item');

		const main = el.createDiv({ cls: 'tt-jump-suggest-main' });
		const dot = main.createSpan({ cls: 'tt-priority-dot' });
		if (task.priority === 'None') dot.addClass('is-none');
		dot.style.background = priorityColor(task.priority);
		dot.title = `Priority: ${task.priority}`;
		main.createSpan({ text: task.name, cls: 'tt-jump-suggest-title' });

		const meta = [task.status, task.area].filter(Boolean).join(' · ');
		if (meta) el.createDiv({ text: meta, cls: 'tt-jump-suggest-meta' });
	}

	onChooseItem(item: Task): void {
		this.onSelect(item);
	}
}
