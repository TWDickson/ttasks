import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readWorkspaceFile(relativePath: string): string {
	return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
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
			'src/store/reminderRules.ts',
			'src/store/reminderStorage.ts',
			'src/store/reminderPreview.ts',
			'src/settings/holidays.ts',
			'src/views/detailHeaderActions.ts',
		]) {
			const content = readWorkspaceFile(relativePath);

			expect(content).not.toContain("from 'obsidian'");
			expect(content).not.toContain('from "obsidian"');
		}
	});
});
