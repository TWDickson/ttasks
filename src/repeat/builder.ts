/**
 * The repeat builder's form model: a flat, always-complete form state that maps
 * to and from a `RepeatRule`. The form keeps every control's value (switching
 * from monthly to weekly and back doesn't lose the day you picked); only the
 * fields relevant to the chosen unit end up in the rule.
 *
 * `ruleFromBuilder` validates through `normalizeRepeat` — the same check the
 * reader applies — so the builder can never save a rule the plugin would reject.
 *
 * Pure module — no Obsidian imports.
 */
import { normalizeRepeat, repeatToFrontmatter } from './normalize';
import { WEEKDAYS, type NthIndex, type NthTarget, type RepeatRule, type RepeatUnit, type Weekday } from './types';

export type MonthMode = 'day' | 'last' | 'nth';
export type EndMode = 'never' | 'until' | 'count';

export interface BuilderState {
	every: number;
	unit: RepeatUnit;
	weekdays: Weekday[];
	monthMode: MonthMode;
	monthday: number;
	nthN: NthIndex;
	nthTarget: NthTarget;
	month: number;
	basis: 'schedule' | 'completion';
	roll: '' | 'next' | 'previous';
	end: EndMode;
	until: string;
	count: number;
}

function parts(date: string | null | undefined): { y: number; m: number; d: number; weekday: Weekday } | null {
	const match = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
	if (!match) return null;
	const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const weekday = WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]!;
	return { y, m, d, weekday };
}

/** The form for a rule, with sensible defaults drawn from the due date for everything the rule leaves unsaid. */
export function builderFromRule(rule: RepeatRule | null, dueDate: string | null, today: string): BuilderState {
	const anchor = parts(dueDate) ?? parts(today)!;
	const nthOfAnchor = Math.min(Math.ceil(anchor.d / 7), 4) as NthIndex;
	return {
		every: rule?.every ?? 1,
		unit: rule?.unit ?? 'week',
		weekdays: rule?.weekdays?.length ? [...rule.weekdays] : [anchor.weekday],
		monthMode: rule?.nth ? 'nth' : rule?.monthday === 'last' ? 'last' : 'day',
		monthday: typeof rule?.monthday === 'number' ? rule.monthday : anchor.d,
		nthN: rule?.nth?.n ?? nthOfAnchor,
		nthTarget: rule?.nth?.target ?? anchor.weekday,
		month: rule?.month ?? anchor.m,
		basis: rule?.basis === 'completion' ? 'completion' : 'schedule',
		roll: rule?.roll ?? '',
		end: rule?.until !== undefined ? 'until' : rule?.count !== undefined ? 'count' : 'never',
		until: rule?.until ?? '',
		count: rule?.count ?? 10,
	};
}

export type BuilderResult = { rule: RepeatRule; error: null } | { rule: null; error: string };

export function ruleFromBuilder(state: BuilderState): BuilderResult {
	if (!Number.isInteger(state.every) || state.every < 1) return { rule: null, error: 'Repeat every must be a whole number of at least 1.' };
	const rule: RepeatRule = { every: state.every, unit: state.unit };

	if (state.unit === 'week' && state.weekdays.length > 0) {
		rule.weekdays = WEEKDAYS.filter((d) => state.weekdays.includes(d));
	}
	if (state.unit === 'month') {
		if (state.monthMode === 'nth') rule.nth = { n: state.nthN, target: state.nthTarget };
		else rule.monthday = state.monthMode === 'last' ? 'last' : state.monthday;
	}
	if (state.unit === 'year') {
		rule.month = state.month;
		rule.monthday = state.monthMode === 'last' ? 'last' : state.monthday;
	}
	if (state.basis === 'completion') rule.basis = 'completion';
	if (state.roll) rule.roll = state.roll;
	if (state.end === 'until') {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(state.until)) return { rule: null, error: 'Pick the date the repeat ends on.' };
		rule.until = state.until;
	}
	if (state.end === 'count') {
		if (!Number.isInteger(state.count) || state.count < 1) return { rule: null, error: 'The number of repeats must be at least 1.' };
		rule.count = state.count;
	}

	// The reader's own validation: the builder may not save what it would reject.
	const check = normalizeRepeat(repeatToFrontmatter(rule));
	return check.rule ? { rule: check.rule, error: null } : { rule: null, error: check.warning ?? 'That repeat is not valid.' };
}
