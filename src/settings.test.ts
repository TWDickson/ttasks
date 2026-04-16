import { describe, expect, it } from 'vitest';
import {
	normalizeStatuses,
	resolveCompletionStatus,
	resolveInboxStatus,
	resolveConfiguredStatus,
	normalizeEditorSuggestTrigger,
	normalizeSettingsFromSources,
	DEFAULT_SETTINGS,
	DEFAULT_STATUSES,
} from './settings';

// ── normalizeStatuses ────────────────────────────────────────────────────────

describe('normalizeStatuses', () => {
	it('returns the input when valid', () => {
		expect(normalizeStatuses(['Active', 'Done'])).toEqual(['Active', 'Done']);
	});

	it('falls back to DEFAULT_STATUSES for null/undefined/empty', () => {
		expect(normalizeStatuses(null)).toEqual(DEFAULT_STATUSES);
		expect(normalizeStatuses(undefined)).toEqual(DEFAULT_STATUSES);
		expect(normalizeStatuses([])).toEqual(DEFAULT_STATUSES);
	});

	it('deduplicates values', () => {
		expect(normalizeStatuses(['Active', 'Active', 'Done'])).toEqual(['Active', 'Done']);
	});

	it('trims whitespace from entries', () => {
		expect(normalizeStatuses(['  Active  ', ' Done '])).toEqual(['Active', 'Done']);
	});

	it('filters blank entries', () => {
		expect(normalizeStatuses(['Active', '', '  ', 'Done'])).toEqual(['Active', 'Done']);
	});
});

// ── resolveCompletionStatus ──────────────────────────────────────────────────

describe('resolveCompletionStatus', () => {
	it('returns the configured value when it is in the list', () => {
		expect(resolveCompletionStatus(['Active', 'Done', 'Closed'], 'Closed')).toBe('Closed');
	});

	it("falls back to 'Done' when configured value is absent but 'Done' exists", () => {
		expect(resolveCompletionStatus(['Active', 'Done'], 'Missing')).toBe('Done');
		expect(resolveCompletionStatus(['Active', 'Done'], null)).toBe('Done');
		expect(resolveCompletionStatus(['Active', 'Done'], undefined)).toBe('Done');
	});

	it("falls back to first status when 'Done' is also absent", () => {
		expect(resolveCompletionStatus(['Active', 'Closed'], 'Missing')).toBe('Active');
	});

	it("falls back to 'Active' when statuses list is empty or null", () => {
		expect(resolveCompletionStatus([], 'Done')).toBe('Active');
		expect(resolveCompletionStatus(null, 'Done')).toBe('Active');
		expect(resolveCompletionStatus(undefined, 'Done')).toBe('Active');
	});
});

// ── resolveInboxStatus ───────────────────────────────────────────────────────

describe('resolveInboxStatus', () => {
	it('returns the configured value when it is in the list', () => {
		expect(resolveInboxStatus(['Inbox', 'Active', 'Done'], 'Inbox')).toBe('Inbox');
		expect(resolveInboxStatus(['Triage', 'Active', 'Done'], 'Triage')).toBe('Triage');
	});

	it("falls back to 'Inbox' when configured value is absent but 'Inbox' exists", () => {
		expect(resolveInboxStatus(['Inbox', 'Active', 'Done'], 'Missing')).toBe('Inbox');
		expect(resolveInboxStatus(['Inbox', 'Active', 'Done'], null)).toBe('Inbox');
		expect(resolveInboxStatus(['Inbox', 'Active', 'Done'], undefined)).toBe('Inbox');
	});

	it("falls back to first status when 'Inbox' is also absent", () => {
		expect(resolveInboxStatus(['Active', 'Done'], 'Missing')).toBe('Active');
	});

	it("falls back to 'Inbox' sentinel when statuses list is empty or null", () => {
		expect(resolveInboxStatus([], 'Inbox')).toBe('Inbox');
		expect(resolveInboxStatus(null, undefined)).toBe('Inbox');
		expect(resolveInboxStatus(undefined, undefined)).toBe('Inbox');
	});
});

// ── resolveConfiguredStatus ──────────────────────────────────────────────────

describe('resolveConfiguredStatus', () => {
	it('returns the configured value when valid', () => {
		expect(resolveConfiguredStatus(['Active', 'In Progress', 'Done'], 'In Progress', 'Active')).toBe('In Progress');
	});

	it('falls back to the preferred value when configured is absent', () => {
		expect(resolveConfiguredStatus(['Active', 'In Progress'], null, 'In Progress')).toBe('In Progress');
		expect(resolveConfiguredStatus(['Active', 'In Progress'], 'Missing', 'Active')).toBe('Active');
	});

	it('falls back to first status when neither configured nor preferred are in the list', () => {
		expect(resolveConfiguredStatus(['Custom'], null, 'In Progress')).toBe('Custom');
	});

	it('uses the preferred string as a last-resort when list is empty', () => {
		expect(resolveConfiguredStatus([], null, 'In Progress')).toBe('In Progress');
	});
});

describe('normalizeEditorSuggestTrigger', () => {
	it('falls back to default when empty', () => {
		expect(normalizeEditorSuggestTrigger('')).toBe('@task');
		expect(normalizeEditorSuggestTrigger('   ')).toBe('@task');
	});

	it('prepends @ when missing', () => {
		expect(normalizeEditorSuggestTrigger('todo')).toBe('@todo');
	});

	it('keeps @ prefix when present', () => {
		expect(normalizeEditorSuggestTrigger('@todo')).toBe('@todo');
	});
});

describe('normalizeSettingsFromSources', () => {
	it('merges external settings over current settings and ignores deprecated swipe fields', () => {
		const current = normalizeSettingsFromSources([
			DEFAULT_SETTINGS,
			{
				tasksFolder: 'Planner/Tasks',
				quickActions: {
					mobileHoldEnabled: false,
					mobileHandedness: 'left',
				},
				editorSuggestTrigger: '@task',
			},
		]);

		const merged = normalizeSettingsFromSources([
			DEFAULT_SETTINGS,
			current,
			{
				quickActions: {
					mobileSwipeEnabled: true,
					mobileSwipeLeftAction: 'defer',
					mobileSwipeRightAction: 'complete',
				},
				editorSuggestTrigger: 'link',
				remindersFired: ['legacy-key'],
			},
		]);

		expect(merged.quickActions.mobileHoldEnabled).toBe(false);
		expect(merged.quickActions.mobileHandedness).toBe('left');
		expect(merged.editorSuggestTrigger).toBe('@link');
		expect(Object.prototype.hasOwnProperty.call(merged, 'remindersFired')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(merged.quickActions, 'mobileSwipeEnabled')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(merged.quickActions, 'mobileSwipeLeftAction')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(merged.quickActions, 'mobileSwipeRightAction')).toBe(false);
	});

	it('preserves existing values when external payload is partial', () => {
		const merged = normalizeSettingsFromSources([
			DEFAULT_SETTINGS,
			{ tasksFolder: 'Planner/Tasks', editorSuggestTrigger: '@todo' },
			{ reminders: { enabled: false } },
		]);

		expect(merged.tasksFolder).toBe('Planner/Tasks');
		expect(merged.editorSuggestTrigger).toBe('@todo');
		expect(merged.reminders.enabled).toBe(false);
	});
});
