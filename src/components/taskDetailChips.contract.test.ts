import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readWorkspaceFile(relativePath: string): string {
	return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('TaskDetail chips control contract', () => {
	it('passes status and priority chip props explicitly (no spread)', () => {
		const content = readWorkspaceFile('src/components/TaskDetail.svelte');

		expect(content).toContain('definition={statusFieldProps.definition}');
		expect(content).toContain('error={statusFieldProps.error}');
		expect(content).toContain('readonly={statusFieldProps.readonly}');
		expect(content).toContain('definition={priorityFieldProps.definition}');
		expect(content).toContain('error={priorityFieldProps.error}');
		expect(content).toContain('readonly={priorityFieldProps.readonly}');
		expect(content).not.toContain('{...statusFieldProps}');
		expect(content).not.toContain('{...priorityFieldProps}');
	});
});