import { describe, expect, it } from 'vitest';
import { pathToLinktext } from './hoverLink';

describe('pathToLinktext', () => {
	it('removes .md extension for vault linktext', () => {
		expect(pathToLinktext('Tasks/abc-task.md')).toBe('Tasks/abc-task');
	});

	it('returns unchanged path when extension is missing', () => {
		expect(pathToLinktext('Tasks/abc-task')).toBe('Tasks/abc-task');
	});
});
