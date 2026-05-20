import { describe, expect, it } from 'vitest';
import { linkReferencesTaskPath } from './relationshipLinkMatch';

describe('linkReferencesTaskPath', () => {
	it('matches when resolver returns exact target path', () => {
		const matched = linkReferencesTaskPath({
			rawValue: '[[abc123-test-task|Test Task]]',
			targetPathWithoutExt: 'Planner/Tasks/abc123-test-task',
			sourcePath: 'Planner/Tasks/def456-source-task.md',
			resolveLinkpathDest: () => 'Planner/Tasks/abc123-test-task.md',
		});

		expect(matched).toBe(true);
	});

	it('matches unresolved short wikilinks by basename fallback', () => {
		const matched = linkReferencesTaskPath({
			rawValue: '[[abc123-test-task|Test Task]]',
			targetPathWithoutExt: 'Planner/Tasks/abc123-test-task',
			sourcePath: 'Planner/Tasks/def456-source-task.md',
			resolveLinkpathDest: () => null,
		});

		expect(matched).toBe(true);
	});

	it('does not match different wikilink targets', () => {
		const matched = linkReferencesTaskPath({
			rawValue: '[[abc123-test-task|Test Task]]',
			targetPathWithoutExt: 'Planner/Tasks/zzz999-other-task',
			sourcePath: 'Planner/Tasks/def456-source-task.md',
			resolveLinkpathDest: () => null,
		});

		expect(matched).toBe(false);
	});
});
