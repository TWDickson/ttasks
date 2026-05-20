import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readWorkspaceFile(relativePath: string): string {
	return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('ChipsField reactive contract', () => {
	it('derives selected values reactively from incoming value prop', () => {
		const content = readWorkspaceFile('src/components/fields/ChipsField.svelte');

		expect(content).toContain('$: values =');
		expect(content).not.toContain("const values = Array.isArray(value) ? value : value ? [value] : [];");
	});
});
