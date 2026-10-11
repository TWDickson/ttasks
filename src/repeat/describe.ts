/**
 * `describeRepeat` — a human label for a rule. Display-only: nothing parses it
 * back, which is what keeps the builder (not text) the entry path.
 *
 * Pure module — no Obsidian imports.
 */
import type { NthTarget, RepeatRule, Weekday } from './types';

const DAY_NAMES: Record<Weekday, string> = {
	mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
};
const DAY_LONG: Record<Weekday, string> = {
	mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};
const UNIT_SINGULAR = { day: 'day', week: 'week', month: 'month', year: 'year' } as const;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function ordinal(n: number): string {
	const mod100 = n % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
	return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

function targetLabel(target: NthTarget): string {
	if (target in DAY_LONG) return DAY_LONG[target as Weekday];
	return ({ day: 'day', weekday: 'weekday', 'weekend-day': 'weekend day', 'working-day': 'working day' } as Record<string, string>)[target]!;
}

function cadence(rule: RepeatRule): string {
	const unit = UNIT_SINGULAR[rule.unit];
	return rule.every === 1 ? `every ${unit}` : `every ${rule.every} ${unit}s`;
}

function detail(rule: RepeatRule): string {
	switch (rule.unit) {
		case 'week':
			return rule.weekdays?.length ? ` on ${rule.weekdays.map((d) => DAY_NAMES[d]).join(', ')}` : '';
		case 'month':
			if (rule.nth) {
				const { n, target } = rule.nth;
				return ` on the ${n === -1 ? 'last' : ordinal(n)} ${targetLabel(target)}`;
			}
			if (rule.monthday === 'last') return ' on the last day';
			return rule.monthday !== undefined ? ` on the ${ordinal(rule.monthday)}` : '';
		case 'year': {
			const month = rule.month !== undefined ? MONTH_NAMES[rule.month - 1] : undefined;
			const day = rule.monthday === 'last' ? 'the last day' : rule.monthday !== undefined ? ordinal(rule.monthday) : undefined;
			if (month && day) return ` on ${month} ${day}`;
			if (month) return ` in ${month}`;
			return day ? ` on the ${day}` : '';
		}
		default:
			return '';
	}
}

export function describeRepeat(rule: RepeatRule): string {
	const parts = [`${cadence(rule)}${detail(rule)}`];
	if (rule.basis === 'completion') parts.push('after completion');
	if (rule.roll) parts.push(`${rule.roll === 'next' ? 'next' : 'previous'} working day if off`);
	if (rule.until) parts.push(`until ${rule.until}`);
	if (rule.count !== undefined) parts.push(`${rule.count} more ${rule.count === 1 ? 'time' : 'times'}`);
	const text = parts.join(', ');
	return text.charAt(0).toUpperCase() + text.slice(1);
}
