import { describe, expect, it } from 'vitest';
import { isTTasksLink, parseCheckboxLine } from './checkboxParser';

describe('parseCheckboxLine', () => {
	it('parses an unchecked bullet checkbox', () => {
		expect(parseCheckboxLine('- [ ] text')).toMatchObject({
			checked: false,
			cancelled: false,
			statusChar: ' ',
			text: 'text',
			indentLevel: 0,
			hasTTasksLink: false,
		});
	});

	it('parses a checked lowercase checkbox', () => {
		expect(parseCheckboxLine('- [x] text')?.checked).toBe(true);
	});

	it('parses a checked uppercase checkbox', () => {
		expect(parseCheckboxLine('- [X] text')?.checked).toBe(true);
	});

	it('parses a cancelled checkbox', () => {
		expect(parseCheckboxLine('- [-] text')).toMatchObject({
			cancelled: true,
			checked: false,
			statusChar: '-',
		});
	});

	it('keeps custom status characters', () => {
		expect(parseCheckboxLine('- [>] text')).toMatchObject({
			statusChar: '>',
			checked: false,
			cancelled: false,
		});
	});

	it('returns null for non-checkbox lines', () => {
		expect(parseCheckboxLine('plain paragraph')).toBeNull();
	});

	it('calculates indent level from two leading spaces', () => {
		expect(parseCheckboxLine('  - [ ] text')?.indentLevel).toBe(1);
	});

	it('parses empty checkbox text', () => {
		expect(parseCheckboxLine('- [ ]')).toMatchObject({
			text: '',
		});
	});

	it('marks Planner/Tasks wikilinks as already promoted', () => {
		expect(parseCheckboxLine('- [ ] [[Planner/Tasks/abc123-task|Task]]')?.hasTTasksLink).toBe(true);
	});

	it('does not mark regular wikilinks as ttasks links', () => {
		expect(parseCheckboxLine('- [ ] regular link [[SomeOtherNote]]')?.hasTTasksLink).toBe(false);
	});

	it('calculates indent level from tab indentation', () => {
		expect(parseCheckboxLine('\t- [ ] text')?.indentLevel).toBe(1);
	});

	it('parses numbered list checkboxes', () => {
		expect(parseCheckboxLine('1. [ ] text')).toMatchObject({
			text: 'text',
			indentLevel: 0,
		});
	});
});

describe('isTTasksLink', () => {
	it('detects links inside a configured tasks folder', () => {
		expect(isTTasksLink('See [[Planner/Tasks/abc123-task|Task]]', 'Planner/Tasks')).toBe(true);
	});

	it('does not match links outside the configured tasks folder', () => {
		expect(isTTasksLink('See [[Archive/abc123-task|Task]]', 'Planner/Tasks')).toBe(false);
	});
});