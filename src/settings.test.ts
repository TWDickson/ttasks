import { describe, expect, it } from 'vitest';
import {
	normalizeStatuses,
	resolveCompletionStatus,
	resolveConfiguredStatus,
	normalizeEditorSuggestTrigger,
	normalizeQuerySpec,
	normalizeSettingsFromSources,
	isSystemStatus,
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

// ── isSystemStatus ───────────────────────────────────────────────────────────

describe('isSystemStatus', () => {
	it('returns true for the completion status', () => {
		expect(isSystemStatus('Done', 'Done')).toBe(true);
	});

	it('returns false for any other status', () => {
		expect(isSystemStatus('Active', 'Done')).toBe(false);
		expect(isSystemStatus('Blocked', 'Done')).toBe(false);
		expect(isSystemStatus('In Progress', 'Done')).toBe(false);
	});

	it('uses the actual configured name, not the hardcoded string', () => {
		expect(isSystemStatus('Closed', 'Closed')).toBe(true);
		expect(isSystemStatus('Done', 'Closed')).toBe(false);
	});

	it('returns false when checking an empty string', () => {
		expect(isSystemStatus('', 'Done')).toBe(false);
	});
});

describe('normalizeSettingsFromSources', () => {
	it('merges external settings over current settings and ignores deprecated swipe and hold fields', () => {
		const merged = normalizeSettingsFromSources([
			DEFAULT_SETTINGS,
			{
				tasksFolder: 'Planner/Tasks',
				quickActions: {
					// legacy hold fields — should be silently dropped
					mobileHoldEnabled: false,
					mobileHandedness: 'left',
					mobileHoldTimeoutMs: 1200,
					// legacy swipe fields — already dropped, keep asserting
					mobileSwipeEnabled: true,
					mobileSwipeLeftAction: 'defer',
					mobileSwipeRightAction: 'complete',
				},
				editorSuggestTrigger: 'link',
				remindersFired: ['legacy-key'],
			},
		]);

		expect(merged.editorSuggestTrigger).toBe('@link');
		// Deprecated hold fields must not appear on the result
		expect(Object.prototype.hasOwnProperty.call(merged.quickActions, 'mobileHoldEnabled')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(merged.quickActions, 'mobileHandedness')).toBe(false);
		expect(Object.prototype.hasOwnProperty.call(merged.quickActions, 'mobileHoldTimeoutMs')).toBe(false);
		// Deprecated swipe fields still absent
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

	it('defaults customViews to an empty array', () => {
		const merged = normalizeSettingsFromSources([DEFAULT_SETTINGS, {}]);

		expect(merged.customViews).toEqual([]);
	});

	it('preserves valid custom view definitions', () => {
		const merged = normalizeSettingsFromSources([
			DEFAULT_SETTINGS,
			{
				customViews: [
					{
						id: 'today-list',
						name: 'Today',
						icon: 'calendar',
						renderer: 'list',
						query: {
							filter: { logic: 'and', conditions: [{ field: 'due_date', operator: 'is', value: 'today' }] },
							sort: [{ field: 'priority', direction: 'asc' }],
							group: { kind: 'field', field: 'status' },
							limit: 5,
						},
						presentation: {
							hierarchy: 'tree',
							graphMode: 'overview',
						},
					},
				],
			},
		]);

		expect(merged.customViews).toHaveLength(1);
		expect(merged.customViews[0]).toMatchObject({
			id: 'today-list',
			name: 'Today',
			icon: 'calendar',
			renderer: 'list',
			presentation: { hierarchy: 'tree', graphMode: 'overview' },
		});
		expect(merged.customViews[0].query.group).toEqual({ kind: 'field', field: 'status' });
	});

	it('drops invalid custom views and deduplicates by id', () => {
		const merged = normalizeSettingsFromSources([
			DEFAULT_SETTINGS,
			{
				customViews: [
					{ id: '', name: 'Missing id', renderer: 'list', query: {}, presentation: {} },
					{ id: 'dup', name: 'First', renderer: 'list', query: {}, presentation: {} },
					{ id: 'dup', name: 'Second', renderer: 'kanban', query: {}, presentation: {} },
					{ id: 'bad-renderer', name: 'Bad', renderer: 'table', query: {}, presentation: {} },
				],
			},
		]);

		expect(merged.customViews).toHaveLength(1);
		expect(merged.customViews[0]).toMatchObject({ id: 'dup', name: 'First', renderer: 'list' });
	});

	it('normalizes legacy custom view query.groupBy into query.group', () => {
		const merged = normalizeSettingsFromSources([
			DEFAULT_SETTINGS,
			{
				customViews: [
					{
						id: 'legacy-board',
						name: 'Legacy Board',
						renderer: 'kanban',
						query: {
							filter: { logic: 'and', conditions: [] },
							sort: [],
							groupBy: 'status',
						},
					},
				],
			},
		]);

		expect(merged.customViews[0].query.group).toEqual({ kind: 'field', field: 'status' });
	});
});

describe('normalizeQuerySpec', () => {
	it('falls back to an empty query when invalid', () => {
		expect(normalizeQuerySpec(null)).toEqual({
			filter: { logic: 'and', conditions: [] },
			sort: [],
			sortScope: 'global',
			group: { kind: 'none' },
			limit: undefined,
			limitPerGroup: undefined,
			search: undefined,
		});
	});

	it('translates legacy groupBy values into the new group model', () => {
		const query = normalizeQuerySpec({
			filter: { logic: 'and', conditions: [] },
			sort: [],
			groupBy: 'area',
		});

		expect(query.group).toEqual({ kind: 'field', field: 'area' });
		expect(query.sortScope).toBe('within_groups');
	});

	it('normalizes date bucket group specs', () => {
		const query = normalizeQuerySpec({
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'date_buckets', field: 'due_date', preset: 'agenda' },
		});

		expect(query.group).toEqual({ kind: 'date_buckets', field: 'due_date', preset: 'agenda' });
		expect(query.sortScope).toBe('within_groups');
	});

	it('honors explicit sortScope values', () => {
		const query = normalizeQuerySpec({
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'field', field: 'status' },
			sortScope: 'global',
		});

		expect(query.sortScope).toBe('global');
	});
});
