import { describe, expect, it } from 'vitest';
import { resetChecklistCompletionInNotes } from './recurrenceNotes';

describe('resetChecklistCompletionInNotes', () => {
	it('converts checked markdown checklist items to unchecked', () => {
		const input = [
			'- [x] done item',
			'- [X] another done item',
			'+ [x] plus marker item',
			'1. [X] ordered item',
			'- [ ] pending item',
		].join('\n');

		expect(resetChecklistCompletionInNotes(input)).toBe([
			'- [ ] done item',
			'- [ ] another done item',
			'+ [ ] plus marker item',
			'1. [ ] ordered item',
			'- [ ] pending item',
		].join('\n'));
	});

	it('preserves non-checklist content', () => {
		const input = [
			'# Heading',
			'',
			'Normal paragraph text.',
			'Text with [x] inline marker should remain unchanged.',
			'```md',
			'- [x] inside fenced content should still be treated as text line',
			'```',
		].join('\n');

		expect(resetChecklistCompletionInNotes(input)).toBe([
			'# Heading',
			'',
			'Normal paragraph text.',
			'Text with [x] inline marker should remain unchanged.',
			'```md',
			'- [ ] inside fenced content should still be treated as text line',
			'```',
		].join('\n'));
	});
});
