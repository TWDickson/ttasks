import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { countHardcodedWording } from './hardcodedWording';

/** Shipped source under src/ — tests, mocks, and the catalogue itself excluded. */
function sourceFiles(dir = 'src'): string[] {
	return readdirSync(resolve(process.cwd(), dir), { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return entry.name === '__mocks__' || entry.name === 'i18n' ? [] : sourceFiles(path);
		if (/\.(test|spec)\.ts$/.test(entry.name) || entry.name === 'test-setup.ts') return [];
		return /\.(ts|svelte)$/.test(entry.name) ? [path] : [];
	});
}

describe('countHardcodedWording', () => {
	it('counts markup text, literal attributes and capitalised expression literals', () => {
		const svelte = `<script>new Notice('Saved'); const k = 'tt-x';</script>
<button aria-label="Close" class="tt-btn">Show all</button>
<span>{open ? 'Hide' : 'Show more'}</span><span class="tt-x">{count}</span>
<style>.a { content: 'Nope'; }</style>`;
		// Notice, aria-label, "Show all", 'Hide', 'Show more'
		expect(countHardcodedWording('x.svelte', svelte)).toBe(5);
	});

	it('ignores wording that already goes through t()', () => {
		expect(countHardcodedWording('x.svelte', `<button aria-label={t('a.b')}>{t('a.c', { n: 1 })}</button>`)).toBe(0);
	});

	it('counts Setting and element text setters in plain TypeScript', () => {
		const ts = `new Setting(el).setName('Due').setDesc(t('x')); el.createEl('b', { text: 'Done' }); setTooltip(el, 'Open');`;
		expect(countHardcodedWording('x.ts', ts)).toBe(3);
	});
});

describe('UI wording lives in src/i18n', () => {
	/* A ratchet, like the clock-read one in architectureBoundaries.test.ts. Each
	   count is the hard-coded wording a file still carries (see hardcodedWording.ts
	   for what counts). New wording goes in src/i18n/en.ts and reaches the UI via
	   t(); a count here may only go down. When you convert a file, lower or delete
	   its entry: the test fails until you do, so the list stays the true to-do. */
	const remaining: Record<string, number> = {
		'src/components/BatchActionBar.svelte': 7,
		'src/components/PomodoroPane.svelte': 13,
		'src/components/RepeatBuilder.svelte': 35,
		'src/components/TaskAgenda.svelte': 1,
		'src/components/TaskArchiveView.svelte': 8,
		'src/components/TaskBoard.svelte': 26,
		'src/components/TaskDetail.svelte': 39,
		'src/components/TaskDetailActions.svelte': 7,
		'src/components/TaskDetailNotes.svelte': 5,
		'src/components/TaskDetailRelationships.svelte': 15,
		'src/components/TaskGraph.svelte': 1,
		'src/components/TaskKanban.svelte': 5,
		'src/components/TaskList.svelte': 3,
		'src/components/TaskRail.svelte': 17,
		'src/components/TaskRow.svelte': 11,
		'src/components/fields/DateField.svelte': 2,
		'src/components/fields/NumberField.svelte': 1,
		'src/components/fields/SelectField.svelte': 1,
		'src/components/fields/TimeField.svelte': 1,
		'src/components/fields/WikiLinkField.svelte': 4,
		'src/components/graph/DependencyGraph.svelte': 13,
		'src/components/graph/DependencyLaneHeaders.svelte': 1,
		'src/components/graph/GraphNodeCard.svelte': 3,
		'src/components/graph/TimelineOverview.svelte': 12,
		'src/components/graph/TimelineTrack.svelte': 1,
		'src/components/taskDetailFieldProps.ts': 1,
		'src/editor/TaskLinkSuggestModal.ts': 1,
		'src/integration/contextMenu.ts': 4,
		'src/integration/sharePreamble.ts': 5,
		'src/main.ts': 18,
		'src/modals/CreateTaskModal.ts': 15,
		'src/modals/FocusUntilModal.ts': 7,
		'src/modals/QueryEditorModal.ts': 36,
		'src/modals/ShareSyncModal.ts': 28,
		'src/modals/confirmModal.ts': 1,
		'src/modals/importConfirm.ts': 1,
		'src/modals/pomodoroQuitModal.ts': 4,
		'src/schema/taskFields.ts': 5,
		'src/settings/SettingsTab.ts': 18,
		'src/settings/ValueMigrationModal.ts': 3,
		'src/settings/archiveSettingsSection.ts': 6,
		'src/settings/captureSourcesSettingsSection.ts': 31,
		'src/settings/kanbanSettingsSection.ts': 3,
		'src/settings/managedListSettingsSection.ts': 13,
		'src/settings/migrationSettingsSection.ts': 7,
		'src/settings/pomodoroSettingsSection.ts': 32,
		'src/settings/quickActionsSettingsSection.ts': 11,
		'src/settings/remindersSettingsSection.ts': 29,
		'src/settings/sharePreambleSettingsSection.ts': 9,
		'src/settings/viewsSettingsSection.ts': 25,
		'src/settings/workingCalendarSettingsSection.ts': 12,
		'src/store/ArchiveService.ts': 6,
		'src/store/TaskWriter.ts': 3,
		'src/views/smartListActions.ts': 4,
	};

	it('no file gains hard-coded wording, and converted files are struck off', () => {
		const actual: Record<string, number> = {};
		for (const path of sourceFiles()) {
			const count = countHardcodedWording(path, readFileSync(resolve(process.cwd(), path), 'utf8'));
			if (count > 0) actual[path.split('\\').join('/')] = count;
		}
		expect(actual, 'put new UI wording in src/i18n/en.ts and render it with t()').toEqual(remaining);
	});
});
