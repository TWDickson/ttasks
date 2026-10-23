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
			'src/store/deriveBlocks.ts',
			'src/store/schemaGuard.ts',
			'src/repeat/types.ts',
			'src/repeat/dates.ts',
			'src/repeat/next.ts',
			'src/repeat/normalize.ts',
			'src/repeat/describe.ts',
			'src/repeat/presets.ts',
			'src/repeat/builder.ts',
			'src/integration/repeatContract.ts',
			'src/utils/frontmatterValue.ts',
			'src/utils/pathUtils.ts',
			'src/utils/taskLabel.ts',
			'src/utils/taskRef.ts',
			'src/utils/deviceStore.ts',
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

	// AR-2 split TaskGraph into a plugin-facing shell and these children, which
	// take props and callbacks so they stay testable (the coupling rule).
	it('graph view components never reach the plugin or the store; their helpers stay Obsidian-free', () => {
		const graphDir = 'src/components/graph';
		const components = readdirSync(resolve(process.cwd(), graphDir))
			.filter((name) => /\.(svelte|ts)$/.test(name) && !name.endsWith('.test.ts'))
			.map((name) => join(graphDir, name));
		expect(components.length).toBeGreaterThan(0);
		for (const path of [...components, 'src/store/graph/graphTrace.ts']) {
			const content = readWorkspaceFile(path);
			expect(content, path).not.toMatch(/from '\.\.\/\.\.\/main'|from '\.\.\/\.\.\/store\/TaskStore'/);
			expect(content, path).not.toContain("from 'obsidian'");
		}
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
			'src/integration/pomodoroAlert.ts',
			'src/integration/pomodoroSounds.ts',
			'src/integration/pomodoroLog.ts',
			'src/integration/pomodoroPlan.ts',
			'src/integration/pomodoroStatusBar.ts',
			'src/integration/workerTicker.ts',
			'src/integration/backgroundThrottling.ts',
			'src/integration/taskJsonExport.ts',
			'src/integration/taskDerivedState.ts',
			'src/integration/taskToonExport.ts',
			'src/integration/taskJsonImport.ts',
			'src/integration/taskJsonContract.ts',
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
			'src/schema/taskPersistence.ts',
			'src/schema/taskCodec.ts',
		]) {
			const content = readWorkspaceFile(relativePath);

			expect(content).not.toContain("from 'obsidian'");
			expect(content).not.toContain('from "obsidian"');
		}
	});

	it('no shipped code touches raw localStorage — device state goes through the vault-scoped DeviceStore (PB-2)', () => {
		const offenders = sourceFiles()
			.filter((path) => /\blocalStorage\.(getItem|setItem|removeItem)/.test(readWorkspaceFile(path)));
		expect(offenders).toEqual([]);
	});

	it('the ISO-date pattern lives only in dateUtils — use isIsoDateString (DT-6)', () => {
		const offenders = sourceFiles()
			.filter((path) => path !== join('src', 'utils', 'dateUtils.ts'))
			.filter((path) => readWorkspaceFile(path).includes('\\d{4}-\\d{2}-\\d{2}'));
		expect(offenders).toEqual([]);
	});

	it('reads the clock only at known boundaries — no new bare `new Date()` (DT-6)', () => {
		// "Now" belongs at the edge: injected into pure code (DT-1's `today`) or
		// read by a service that owns timing. Each count here is a reviewed site;
		// a new one fails until it's either injected or deliberately listed.
		// dateUtils is the boundary itself and isn't counted.
		const allowed: Record<string, number> = {
			'src/utils/todayStore.ts': 1, // the midnight-rollover clock
			'src/store/ReminderService.ts': 4, // the reminder poll
			'src/store/archiveUtils.ts': 1, // injectable default
			'src/store/ArchiveService.ts': 1, // archive-history timestamp
			'src/integration/ScanEngine.ts': 1, // daily-note "yesterday" lookup
			'src/modals/FocusUntilModal.ts': 2, // parses "focus until HH:MM" against now
			'src/modals/ShareSyncModal.ts': 1, // export timestamp
			'src/components/graph/DependencyGraph.svelte': 1, // layout-diagnostics log timestamp
			'src/main.ts': 2, // Share/Sync export timestamp + filename
		};
		const actual: Record<string, number> = {};
		for (const path of sourceFiles()) {
			if (path === join('src', 'utils', 'dateUtils.ts')) continue;
			const count = readWorkspaceFile(path).split('new Date()').length - 1;
			if (count > 0) actual[path.split('\\').join('/')] = count;
		}
		expect(actual).toEqual(allowed);
	});
});
