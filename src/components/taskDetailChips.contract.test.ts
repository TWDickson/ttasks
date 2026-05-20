import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readWorkspaceFile(relativePath: string): string {
	return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('TaskDetail controlled-field contract', () => {
	it('passes detail field props explicitly without spread overrides', () => {
		const content = readWorkspaceFile('src/components/TaskDetail.svelte');

		expect(content).toContain('definition={statusFieldProps.definition}');
		expect(content).toContain('error={statusFieldProps.error}');
		expect(content).toContain('readonly={statusFieldProps.readonly}');
		expect(content).toContain('definition={priorityFieldProps.definition}');
		expect(content).toContain('error={priorityFieldProps.error}');
		expect(content).toContain('readonly={priorityFieldProps.readonly}');
		expect(content).toContain('definition={nameFieldProps.definition}');
		expect(content).toContain('definition={areaFieldProps.definition}');
		expect(content).toContain('definition={labelsFieldProps.definition}');
		expect(content).toContain('definition={dueDateFieldProps.definition}');
		expect(content).toContain('definition={startDateFieldProps.definition}');
		expect(content).toContain('definition={assignedToFieldProps.definition}');
		expect(content).toContain('definition={estimatedDaysFieldProps.definition}');
		expect(content).toContain('definition={blockedReasonFieldProps.definition}');
		expect(content).toContain('definition={recurrenceFieldProps.definition}');
		expect(content).toContain('definition={recurrenceTypeFieldProps.definition}');
		expect(content).toContain('definition={reminderOverrideFieldProps.definition}');
		expect(content).toContain('definition={parentTaskFieldProps.definition}');
		expect(content).toContain('context={parentTaskFieldProps.context}');
		expect(content).not.toContain('{...statusFieldProps}');
		expect(content).not.toContain('{...priorityFieldProps}');
		expect(content).not.toContain('{...nameFieldProps}');
		expect(content).not.toContain('{...parentTaskFieldProps}');
		expect(content).not.toContain('{...areaFieldProps}');
		expect(content).not.toContain('{...labelsFieldProps}');
		expect(content).not.toContain('{...dueDateFieldProps}');
		expect(content).not.toContain('{...startDateFieldProps}');
		expect(content).not.toContain('{...assignedToFieldProps}');
		expect(content).not.toContain('{...estimatedDaysFieldProps}');
		expect(content).not.toContain('{...blockedReasonFieldProps}');
		expect(content).not.toContain('{...recurrenceFieldProps}');
		expect(content).not.toContain('{...recurrenceTypeFieldProps}');
		expect(content).not.toContain('{...reminderOverrideFieldProps}');
	});
});