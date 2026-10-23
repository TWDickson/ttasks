/**
 * The read boundary for repeat rules: gathers the flat `ttask_repeat_*` keys from
 * a note's frontmatter, coerces types, and enforces the invariants.
 *
 * An inconsistent hand-edited combination normalizes to `null` **with a warning**
 * the UI can badge — never a silent guess. There is deliberately no
 * natural-language parser: a builder is the primary entry path, so a text DSL
 * would only be a lossy round-trip layer with its own parser to maintain.
 *
 * Pure module — no Obsidian imports.
 */
import {
	NTH_CLASS_TARGETS, NTH_INDEXES, REPEAT_UNITS, WEEKDAYS,
	type NthIndex, type NthTarget, type RepeatRule, type RepeatUnit, type Weekday,
} from './types';
import { isIsoDateString } from '../utils/dateUtils';

/** The frontmatter keys, one per rule field. `ttask_repeat_of` (RP-3) is link bookkeeping, not rule data. */
export const REPEAT_KEYS = {
	every: 'ttask_repeat_every',
	unit: 'ttask_repeat_unit',
	weekdays: 'ttask_repeat_weekdays',
	monthday: 'ttask_repeat_monthday',
	month: 'ttask_repeat_month',
	nth: 'ttask_repeat_nth',
	nthTarget: 'ttask_repeat_nth_target',
	basis: 'ttask_repeat_basis',
	roll: 'ttask_repeat_roll',
	until: 'ttask_repeat_until',
	count: 'ttask_repeat_count',
} as const;

export type NormalizedRepeat =
	| { rule: RepeatRule; warning: null }
	| { rule: null; warning: string | null };

const NO_REPEAT: NormalizedRepeat = { rule: null, warning: null };
const bad = (warning: string): NormalizedRepeat => ({ rule: null, warning });

function toInt(raw: unknown): number | null {
	const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
	return typeof n === 'number' && Number.isInteger(n) ? n : null;
}

function present(raw: unknown): boolean {
	return raw !== undefined && raw !== null && raw !== '' && !(Array.isArray(raw) && raw.length === 0);
}

export function normalizeRepeat(fm: Record<string, unknown>): NormalizedRepeat {
	const k = REPEAT_KEYS;
	const hasAny = Object.values(k).some((key) => present(fm[key]));
	if (!hasAny) return NO_REPEAT;
	if (!present(fm[k.every])) {
		return bad(`Repeat settings found without "${k.every}"; the task will not repeat.`);
	}

	const every = toInt(fm[k.every]);
	if (every === null || every < 1) return bad(`"${k.every}" must be a whole number of at least 1.`);

	const unit = fm[k.unit];
	if (typeof unit !== 'string' || !(REPEAT_UNITS as readonly string[]).includes(unit)) {
		return bad(`"${k.unit}" must be one of ${REPEAT_UNITS.join(', ')}.`);
	}
	const rule: RepeatRule = { every, unit: unit as RepeatUnit };

	// weekdays — week only
	if (present(fm[k.weekdays])) {
		if (unit !== 'week') return bad(`"${k.weekdays}" only applies to a weekly repeat.`);
		const list = Array.isArray(fm[k.weekdays]) ? fm[k.weekdays] as unknown[] : [fm[k.weekdays]];
		const days = list.map((v) => String(v).toLowerCase());
		if (!days.every((d) => (WEEKDAYS as readonly string[]).includes(d))) {
			return bad(`"${k.weekdays}" must be a list of ${WEEKDAYS.join(', ')}.`);
		}
		rule.weekdays = [...new Set(days)] as Weekday[];
	}

	// monthday — month | year
	if (present(fm[k.monthday])) {
		if (unit !== 'month' && unit !== 'year') return bad(`"${k.monthday}" only applies to a monthly or yearly repeat.`);
		const raw = fm[k.monthday];
		if (raw === 'last') rule.monthday = 'last';
		else {
			const day = toInt(raw);
			if (day === null || day < 1 || day > 31) return bad(`"${k.monthday}" must be 1–31 or "last".`);
			rule.monthday = day;
		}
	}

	// month — year
	if (present(fm[k.month])) {
		if (unit !== 'year') return bad(`"${k.month}" only applies to a yearly repeat.`);
		const m = toInt(fm[k.month]);
		if (m === null || m < 1 || m > 12) return bad(`"${k.month}" must be 1–12.`);
		rule.month = m;
	}

	// nth + nth_target — month, exclusive with monthday
	const hasNth = present(fm[k.nth]);
	const hasTarget = present(fm[k.nthTarget]);
	if (hasNth || hasTarget) {
		if (unit !== 'month') return bad(`"${k.nth}" only applies to a monthly repeat.`);
		if (!hasNth || !hasTarget) return bad(`"${k.nth}" and "${k.nthTarget}" must be set together.`);
		if (rule.monthday !== undefined) return bad(`"${k.nth}" and "${k.monthday}" can't both be set.`);
		const n = toInt(fm[k.nth]);
		if (n === null || !(NTH_INDEXES as readonly number[]).includes(n)) return bad(`"${k.nth}" must be 1–5 or -1 (last).`);
		const target = String(fm[k.nthTarget]).toLowerCase();
		if (!(WEEKDAYS as readonly string[]).includes(target) && !(NTH_CLASS_TARGETS as readonly string[]).includes(target)) {
			return bad(`"${k.nthTarget}" must be a weekday name, day, weekday, weekend-day or working-day.`);
		}
		rule.nth = { n: n as NthIndex, target: target as NthTarget };
	}

	if (present(fm[k.basis])) {
		if (fm[k.basis] !== 'completion' && fm[k.basis] !== 'schedule') return bad(`"${k.basis}" must be "completion" (or omitted).`);
		if (fm[k.basis] === 'completion') rule.basis = 'completion';
	}

	if (present(fm[k.roll])) {
		if (fm[k.roll] !== 'next' && fm[k.roll] !== 'previous') return bad(`"${k.roll}" must be "next" or "previous".`);
		rule.roll = fm[k.roll] as 'next' | 'previous';
	}

	if (present(fm[k.until])) {
		const until = String(fm[k.until]).slice(0, 10);
		if (!isIsoDateString(until)) return bad(`"${k.until}" must be a YYYY-MM-DD date.`);
		rule.until = until;
	}

	if (present(fm[k.count])) {
		const count = toInt(fm[k.count]);
		if (count === null || count < 0) return bad(`"${k.count}" must be a whole number of 0 or more.`);
		rule.count = count;
	}

	return { rule, warning: null };
}

/** The inverse: the keys to write for a rule. Absent fields yield no key (sparse). */
export function repeatToFrontmatter(rule: RepeatRule): Record<string, unknown> {
	const k = REPEAT_KEYS;
	const out: Record<string, unknown> = { [k.every]: rule.every, [k.unit]: rule.unit };
	if (rule.weekdays?.length) out[k.weekdays] = [...rule.weekdays];
	if (rule.monthday !== undefined) out[k.monthday] = rule.monthday;
	if (rule.month !== undefined) out[k.month] = rule.month;
	if (rule.nth) { out[k.nth] = rule.nth.n; out[k.nthTarget] = rule.nth.target; }
	if (rule.basis === 'completion') out[k.basis] = 'completion';
	if (rule.roll) out[k.roll] = rule.roll;
	if (rule.until) out[k.until] = rule.until;
	if (rule.count !== undefined) out[k.count] = rule.count;
	return out;
}
