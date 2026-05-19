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
});
