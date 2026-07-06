import { describe, expect, it } from 'vitest';
import { buildReminderPreviews } from './reminderPreview';
import type { RemindersSettings } from '../settings/types';

const BASE: RemindersSettings = {
	enabled: true,
	ruleDueToday: false,
	ruleOverdue: false,
	ruleStaleInProgress: false,
	ruleLeadTime: false,
	leadTimeDays: 3,
	staleThresholdDays: 7,
	quietHoursEnabled: false,
	quietStart: 22,
	quietEnd: 8,
};

describe('buildReminderPreviews', () => {
	it('returns nothing when reminders are disabled', () => {
		expect(buildReminderPreviews({ ...BASE, enabled: false, ruleDueToday: true })).toEqual([]);
	});

	it('returns nothing when enabled but no rules are on', () => {
		expect(buildReminderPreviews(BASE)).toEqual([]);
	});

	it('emits one preview per enabled rule, using production wording', () => {
		const previews = buildReminderPreviews({
			...BASE,
			ruleDueToday: true,
			ruleOverdue: true,
			ruleLeadTime: true,
			ruleStaleInProgress: true,
		}, 'Sample');

		expect(previews.map((p) => p.ruleId)).toEqual(['due-today', 'overdue', 'lead-time', 'stale']);
		expect(previews.map((p) => p.message)).toEqual([
			'Due today: Sample',
			'Overdue: Sample',
			'Coming up: Sample (in 3 days)',
			'Stale in-progress: Sample (7 days)',
		]);
	});

	it('singularizes day counts', () => {
		const previews = buildReminderPreviews({
			...BASE,
			ruleLeadTime: true,
			leadTimeDays: 1,
			ruleStaleInProgress: true,
			staleThresholdDays: 1,
		}, 'Sample');
		expect(previews.map((p) => p.message)).toEqual([
			'Coming up: Sample (in 1 day)',
			'Stale in-progress: Sample (1 day)',
		]);
	});
});
