import { EditorSuggest, TFile, type App, type Editor, type EditorPosition, type EditorSuggestContext, type EditorSuggestTriggerInfo } from 'obsidian';
import type { Task } from '../types';
import type TTasksPlugin from '../main';
import { findTaskTrigger } from '../integration/editorTrigger';
import { filterTaskSuggestions } from '../integration/editorAssist';
import { buildAliasedLink } from '../integration/relationshipLink';

export class TaskLinkEditorSuggest extends EditorSuggest<Task> {
	constructor(app: App, private readonly plugin: TTasksPlugin) {
		super(app);
		this.setInstructions([
			{ command: 'Enter', purpose: 'Insert task link' },
			{ command: 'Esc', purpose: 'Dismiss' },
		]);
	}

	onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile | null): EditorSuggestTriggerInfo | null {
		const lineText = editor.getLine(cursor.line);
		const match = findTaskTrigger(lineText, cursor.ch, this.plugin.settings.editorSuggestTrigger);
		if (!match) return null;
		return {
			start: { line: cursor.line, ch: match.start },
			end: { line: cursor.line, ch: match.end },
			query: match.query,
		};
	}

	getSuggestions(context: EditorSuggestContext): Task[] {
		return filterTaskSuggestions(context.query, this.plugin.taskStoreTasksSnapshot())
			.filter((task) => task.type === 'task' || task.type === 'project')
			.slice(0, 30);
	}

	renderSuggestion(task: Task, el: HTMLElement): void {
		el.addClass('tt-editor-suggest-item');
		el.createDiv({ text: task.name, cls: 'tt-editor-suggest-title' });
		el.createDiv({ text: task.path, cls: 'tt-editor-suggest-path' });
	}

	selectSuggestion(task: Task, evt: MouseEvent | KeyboardEvent): void {
		const context = this.context;
		if (!context) return;
		evt.preventDefault();
		const sourcePath = context.file?.path ?? this.app.workspace.getActiveFile()?.path ?? '';
		const pathWithoutExt = task.path.replace(/\.md$/, '');
		const link = buildAliasedLink({
			targetPathWithoutExt: pathWithoutExt,
			alias: task.name,
			sourcePath,
			resolveFile: (path) => {
				const resolved = this.app.vault.getAbstractFileByPath(path);
				return resolved instanceof TFile ? resolved : null;
			},
			generateMarkdownLink: (file, src, subpath, alias) => this.app.fileManager.generateMarkdownLink(file, src, subpath, alias),
		});
		context.editor.replaceRange(link, context.start, context.end);
		this.close();
	}
}
