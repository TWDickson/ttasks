import type { RemindersSettings } from '../settings/types';
import {
	formatDueTodayMessage,
	formatLeadTimeMessage,
	formatOverdueMessage,
	formatStaleMessage,
	type ReminderRuleId,
} from './reminderRules';

export interface ReminderPreview {
	ruleId: ReminderRuleId;
	message: string;
}

/** Sample task name used in preview notices so users see the real format. */
export const REMINDER_PREVIEW_TASK_NAME = 'Draft release notes';

/**
 * Build one sample reminder message per enabled rule, using the exact wording
 * production reminders use. Powers the "Preview reminders" button in settings so
 * users can see what each rule looks like before it fires for real. Returns an
 * empty array when reminders are disabled or no rules are on.
 */
export function buildReminderPreviews(
	reminders: RemindersSettings,
	taskName: string = REMINDER_PREVIEW_TASK_NAME,
): ReminderPreview[] {
	if (!reminders.enabled) return [];

	const previews: ReminderPreview[] = [];
	if (reminders.ruleDueToday) {
		previews.push({ ruleId: 'due-today', message: formatDueTodayMessage(taskName) });
	}
	if (reminders.ruleOverdue) {
		previews.push({ ruleId: 'overdue', message: formatOverdueMessage(taskName) });
	}
	if (reminders.ruleLeadTime) {
		previews.push({ ruleId: 'lead-time', message: formatLeadTimeMessage(taskName, reminders.leadTimeDays) });
	}
	if (reminders.ruleStaleInProgress) {
		previews.push({ ruleId: 'stale', message: formatStaleMessage(taskName, reminders.staleThresholdDays) });
	}
	return previews;
}
