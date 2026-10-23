import type { Task } from '../types';
import { PRIORITIES, REMINDER_OVERRIDES, TASK_RECORD_TYPES } from '../constants';
import { isIsoDateString, toCalendarDate } from '../utils/dateUtils';
import {
	toFrontmatterBoolean,
	toFrontmatterEnum,
	toFrontmatterNumber,
	toFrontmatterOptionalEnum,
	toFrontmatterScalar,
	toFrontmatterString,
	toFrontmatterStringArray,
	toFrontmatterStringOrNull,
} from '../utils/frontmatterValue';
import { PERSISTENCE_ENTRIES, TASK_PERSISTENCE, fmKey, isBlankStoredValue, type FieldKind, type KindValue } from './taskPersistence';
import { REPEAT_KEYS, normalizeRepeat, repeatToFrontmatter } from '../repeat/normalize';
import type { RepeatRule } from '../repeat/types';

/**
 * The frontmatter ↔ `Task` codec, driven by `TASK_PERSISTENCE`. Reading and
 * creation-time writing used to be two hand-kept field lists in `TaskStore` and
 * `TaskWriter`; both now walk the one table, so a field's key, kind and
 * participation are declared once (AR-3). MD-1 renames a key by editing its
 * `fmKey`; MD-2 omits empty keys by changing `onCreate`.
 *
 * Pure module — no Obsidian imports.
 */

/** Fields that live in frontmatter (everything except file metadata, the body, and derived flags). */
export type StoredTaskFields = Omit<Task, 'id' | 'slug' | 'path' | 'notes' | 'is_complete' | 'is_inbox' | 'blocks'>;

const ALL_REPEAT_KEYS = Object.values(REPEAT_KEYS);

export interface ReadContext {
	/** The user's configured statuses; an unrecognised value falls back to `initialStatus`. */
	statuses: readonly string[];
	initialStatus: string;
	/** Resolve one raw wiki-link value to a vault path (needs the metadata cache, so it is injected). */
	resolveLink: (raw: unknown) => string | null;
}

// ── Read ──────────────────────────────────────────────────────────────────────

function asList(raw: unknown): unknown[] {
	return Array.isArray(raw) ? raw : [raw];
}

/** Kinds decoded one key at a time (`repeat` is a key group; `derived` isn't stored). */
type ScalarKind = Exclude<FieldKind, 'derived' | 'repeat'>;

/**
 * One decoder per kind, each typed to return that kind's `KindValue` — and
 * `TASK_PERSISTENCE` proves every kind fits its field. Together they are what
 * makes the `StoredTaskFields` cast in `readStoredFields` sound (AR-6).
 */
const DECODERS: { [K in ScalarKind]: (raw: unknown, ctx: ReadContext) => KindValue[K] } = {
	recordType: (raw) => toFrontmatterEnum(raw, TASK_RECORD_TYPES, 'task'),
	title: (raw) => toFrontmatterString(toFrontmatterScalar(raw)),
	text: (raw) => toFrontmatterString(raw),
	textOrNull: (raw) => toFrontmatterStringOrNull(raw),
	time: (raw) => toFrontmatterStringOrNull(raw),
	status: (raw, ctx) => toFrontmatterEnum(raw, ctx.statuses, ctx.initialStatus),
	priority: (raw) => toFrontmatterEnum(raw, PRIORITIES, 'None'),
	reminder: (raw) => toFrontmatterOptionalEnum(raw, REMINDER_OVERRIDES),
	strings: (raw) => toFrontmatterStringArray(raw),
	link: (raw, ctx) => ctx.resolveLink(raw),
	links: (raw, ctx) => asList(raw).map(ctx.resolveLink).filter((v): v is string => v !== null),
	date: (raw) => toCalendarDate(raw),
	number: (raw) => toFrontmatterNumber(toFrontmatterScalar(raw)),
	flag: (raw) => toFrontmatterBoolean(raw),
	dates: (raw) => asList(raw).map((v) => toCalendarDate(v)).filter((v): v is string => v !== null),
};

/** Decode every stored field of a note's frontmatter, tolerating Obsidian's retyped properties. */
export function readStoredFields(fm: Record<string, unknown>, ctx: ReadContext): StoredTaskFields {
	const out: Record<string, unknown> = {};
	for (const [field, p] of PERSISTENCE_ENTRIES) {
		if (p.fmKey === null) continue;
		if (p.kind === 'repeat') {
			// A hand-edited combination that doesn't hold together reads as "doesn't
			// repeat" plus a warning the UI shows — never a guessed rule.
			const { rule, warning } = normalizeRepeat(fm);
			out[field] = rule;
			out.repeat_warning = warning;
			continue;
		}
		if (p.kind === 'derived') continue;
		out[field] = DECODERS[p.kind](fm[p.fmKey], ctx);
	}
	// Sound by construction: each value came from its kind's decoder, and the
	// table's type proves that kind fits the field. TS can't follow the loop.
	return out as unknown as StoredTaskFields;
}

// ── Write (creation) ──────────────────────────────────────────────────────────

const esc = (value: unknown) => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function blankFor(kind: FieldKind): unknown {
	return kind === 'strings' || kind === 'links' || kind === 'dates' ? [] : null;
}

function yamlList(items: string[]): string {
	return items.length ? `\n${items.map((item) => `  - ${item}`).join('\n')}` : ' []';
}

function encode(kind: FieldKind, value: unknown, resolveName: (pathWithoutExt: string) => string | null): string {
	const link = (p: unknown): string => {
		if (!p || typeof p !== 'string') return 'null';
		const clean = p.replace(/\.md$/, '');
		// An unresolvable target gets a bare link — never an alias derived from
		// its filename, which would read as a title the task doesn't have.
		const name = resolveName(clean);
		return name ? `'[[${clean}|${name}]]'` : `'[[${clean}]]'`;
	};
	switch (kind) {
		case 'recordType': return String(value);
		case 'title':
		case 'text':
		case 'status':
		case 'priority': return `"${esc(value)}"`;
		case 'textOrNull':
		case 'reminder': return value ? `"${esc(value)}"` : 'null';
		case 'strings': return yamlList((value as string[]).map((v) => `"${esc(v)}"`));
		case 'link': return link(value);
		case 'links': return yamlList((value as string[]).map(link));
		case 'date':
		case 'time': return value ? `'${value}'` : 'null';
		case 'number': return String(value ?? 'null');
		case 'flag': return value === true ? 'true' : 'false';
		case 'dates':
			return yamlList(
				(Array.isArray(value) ? value : [])
					.filter(isIsoDateString)
					.map((v) => `'${v}'`),
			);
		case 'repeat':
		case 'derived': return 'null';
	}
}

/** One `ttask_repeat_*` line. Dates are quoted like every other date key. */
function encodeRepeatLine(key: string, value: unknown): string {
	if (Array.isArray(value)) return `${key}:${yamlList(value.map(String))}`;
	if (key === REPEAT_KEYS.until) return `${key}: '${String(value)}'`;
	return `${key}: ${String(value)}`;
}

/**
 * The frontmatter block for a brand-new note. Walks the table in order, so the
 * key order is the table's. `cssclasses` is not a Task field; it follows `name`.
 */
export function serializeNewTaskFrontmatter(
	task: Task,
	resolveName: (pathWithoutExt: string) => string | null,
): string {
	const lines: string[] = ['---'];
	for (const [field, p] of PERSISTENCE_ENTRIES) {
		if (p.fmKey === null || p.onCreate === false) continue;
		const own = task[field];
		const value = p.seed === 'blank' ? blankFor(p.kind) : p.seed === 'created' ? task.created : own;
		// Sparse: an optional field with nothing to say gets no key at all.
		if (p.onCreate === 'when-set' && isBlankStoredValue(p.kind, value)) continue;
		if (p.kind === 'repeat') {
			for (const [key, v] of Object.entries(repeatToFrontmatter(value as RepeatRule))) lines.push(encodeRepeatLine(key, v));
			continue;
		}
		const encoded = encode(p.kind, value, resolveName);
		// List encodings carry their own leading space/newline; scalars need one.
		lines.push(/^[ \n]/.test(encoded) ? `${p.fmKey}:${encoded}` : `${p.fmKey}: ${encoded}`);
		if (field === 'name') lines.push('cssclasses: [ttask]');
	}
	lines.push('---');
	return lines.join('\n');
}

// ── Write (update) ────────────────────────────────────────────────────────────

/**
 * Set a stored field on a note's frontmatter, or remove its key when the value is
 * blank (MD-2). Fields marked `always` keep their key and take `null` instead, so
 * a note never loses `type`, `name`, `status`, `created` or `status_changed`.
 * Every frontmatter write after creation goes through here.
 */
export function writeStoredField(fm: Record<string, unknown>, field: keyof Task, value: unknown): void {
	const p = TASK_PERSISTENCE[field];
	if (p.kind === 'repeat') {
		// The rule owns its whole key group: clear it, then write what the new rule needs.
		for (const key of ALL_REPEAT_KEYS) delete fm[key];
		if (value) Object.assign(fm, repeatToFrontmatter(value as RepeatRule));
		return;
	}
	const key = fmKey(field);
	if (p.onCreate !== 'always' && isBlankStoredValue(p.kind, value)) delete fm[key];
	else fm[key] = value ?? null;
}
