import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function readWorkspaceFile(relativePath: string): string {
	return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

/** Every shipped source file under `src/` — tests, mocks and fixtures excluded. */
function sourceFiles(dir = 'src'): string[] {
	return readdirSync(resolve(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === '__mocks__' ? [] : sourceFiles(path);
		if (/\.(test|spec|contract\.test)\.ts$/.test(entry.name)) return [];
		if (entry.name === 'test-setup.ts') return [];
		return /\.(ts|svelte)$/.test(entry.name) ? [path] : [];
	});
}

describe('architecture boundaries', () => {
	it('TaskDetail delegates action orchestration to taskDetailActions helpers', () => {
		const content = readWorkspaceFile('src/components/TaskDetail.svelte');

		expect(content).toContain("from './taskDetailActions'");
		expect(content).toContain('runMarkCompleteFlow');
		expect(content).toContain('runDeleteFlow');
		expect(content).toContain('runArchiveFlow');
	});

	it('TaskBoard delegates batch orchestration to taskBoardBatchActions helpers', () => {
		const content = readWorkspaceFile('src/components/TaskBoard.svelte');

		expect(content).toContain("from './taskBoardBatchActions'");
		expect(content).toContain('runBatchComplete');
		expect(content).toContain('runBatchArchive');
		expect(content).toContain('runBatchDelete');
	});

	it('Main plugin delegates context menu action composition to taskActionPorts', () => {
		const content = readWorkspaceFile('src/main.ts');

		expect(content).toContain("from './integration/taskActionPorts'");
		expect(content).toContain('createTaskContextMenuDeps');
	});

	it('SettingsTab delegates section rendering to extracted settings modules', () => {
		const content = readWorkspaceFile('src/settings/SettingsTab.ts');

		expect(content).toContain("from './viewsSettingsSection'");
		expect(content).toContain("from './quickActionsSettingsSection'");
		expect(content).toContain("from './remindersSettingsSection'");
		expect(content).toContain("from './kanbanSettingsSection'");
		expect(content).toContain("from './archiveSettingsSection'");
		expect(content).toContain("from './managedListSettingsSection'");
		expect(content).toContain('renderViewsSettingsSection({');
		expect(content).toContain('renderQuickActionsSettingsSection({');
		expect(content).toContain('renderRemindersSettingsSection({');
		expect(content).toContain('renderKanbanSettingsSection({');
		expect(content).toContain('renderArchiveSettingsSection({');
		expect(content).toContain('renderManagedListSettingSection({');
	});

	it('frontmatter-coercion utils stay pure and free of Obsidian imports', () => {
		for (const relativePath of [
			'src/utils/dateUtils.ts',
			'src/utils/frontmatterValue.ts',
			'src/utils/pathUtils.ts',
			'src/utils/taskLabel.ts',
			'src/utils/taskRef.ts',
			'src/utils/badgePalette.ts',
			'src/settings/statusPolicy.ts',
		]) {
			const content = readWorkspaceFile(relativePath);

			expect(content).not.toContain("from 'obsidian'");
			expect(content).not.toContain('from "obsidian"');
		}
	});

	/* Since deferred views landed in Obsidian 1.7.2 — our minAppVersion — a leaf
	   that isn't in the foreground holds a `DeferredView` placeholder rather than
	   the real view, so anything you reach for by casting (`file`, `editor`,
	   `getState()`) is simply absent. That produced two separate bugs before it
	   was understood: sidebar tabs we failed to recognise and duplicated, and a
	   body rewrite that skipped its editor-settle delay for a note open in a
	   background tab. The answer both times was the leaf's *view state*, which is
	   populated whether or not the view is loaded.

	   `leaf.view.getViewType()` stays legal — a DeferredView reports its type
	   honestly — and so does passing `leaf.view` somewhere that duck-types it.
	   The cast is the tell, so the cast is what's banned. */
	it('no source file casts leaf.view to reach past a DeferredView', () => {
		const offenders = sourceFiles()
			.filter((path) => /\.view\s+as\s+/.test(readWorkspaceFile(path)));

		expect(offenders, 'read leaf.getViewState() instead — see src/views/openFileLeaves.ts').toEqual([]);
	});

	it('BoardStateService stays pure and free of Obsidian imports', () => {
		const content = readWorkspaceFile('src/store/BoardStateService.ts');

		expect(content).not.toContain("from 'obsidian'");
		expect(content).not.toContain('from "obsidian"');
	});

	it('Stream I parsing helpers stay pure and free of Obsidian imports', () => {
		for (const relativePath of [
			'src/integration/checkboxParser.ts',
			'src/integration/emojiFieldParser.ts',
			'src/integration/filenameDateParser.ts',
			'src/integration/promoteTask.ts',
			'src/integration/completionSync.ts',
			'src/integration/importScanner.ts',
			'src/integration/scanErrorPolicy.ts',
			'src/integration/captureSourceFiles.ts',
			'src/integration/protocol.ts',
			'src/integration/pomodoro.ts',
			'src/integration/pomodoroLog.ts',
			'src/integration/pomodoroPlan.ts',
			'src/integration/pomodoroStatusBar.ts',
			'src/integration/taskJsonExport.ts',
			'src/integration/taskToonExport.ts',
			'src/integration/taskJsonImport.ts',
			'src/integration/taskExportFilter.ts',
			'src/integration/taskImportPlan.ts',
			'src/integration/sharePreamble.ts',
			'src/store/PomodoroService.ts',
			'src/store/reminderRules.ts',
			'src/store/reminderStorage.ts',
			'src/store/reminderPreview.ts',
			'src/settings/holidays.ts',
			'src/views/detailHeaderActions.ts',
			'src/views/leafHygiene.ts',
			'src/views/openFileLeaves.ts',
			'src/query/taskReadiness.ts',
			'src/query/taskImpediment.ts',
			'src/query/hashSearch.ts',
		]) {
			const content = readWorkspaceFile(relativePath);

			expect(content).not.toContain("from 'obsidian'");
			expect(content).not.toContain('from "obsidian"');
		}
	});
});
