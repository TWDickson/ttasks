import type { Task } from '../types';
import { PRIORITIES, REMINDER_OVERRIDES, TASK_RECORD_TYPES } from '../constants';
import { toCalendarDate } from '../utils/dateUtils';
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
import { TASK_PERSISTENCE, type FieldKind, type FieldPersistence } from './taskPersistence';

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
export type StoredTaskFields = Omit<Task, 'id' | 'slug' | 'path' | 'notes' | 'is_complete' | 'is_inbox'>;

export interface ReadContext {
	/** The user's configured statuses; an unrecognised value falls back to `initialStatus`. */
	statuses: readonly string[];
	initialStatus: string;
	/** Resolve one raw wiki-link value to a vault path (needs the metadata cache, so it is injected). */
	resolveLink: (raw: unknown) => string | null;
}

const ENTRIES = Object.entries(TASK_PERSISTENCE) as [keyof Task, FieldPersistence][];

// ── Read ──────────────────────────────────────────────────────────────────────

function asList(raw: unknown): unknown[] {
	return Array.isArray(raw) ? raw : [raw];
}

function decode(kind: FieldKind, raw: unknown, ctx: ReadContext): unknown {
	switch (kind) {
		case 'recordType': return toFrontmatterEnum(raw, TASK_RECORD_TYPES, 'task');
		case 'title': return toFrontmatterString(toFrontmatterScalar(raw));
		case 'text': return toFrontmatterString(raw);
		case 'textOrNull':
		case 'time': return toFrontmatterStringOrNull(raw);
		case 'status': return toFrontmatterEnum(raw, ctx.statuses, ctx.initialStatus);
		case 'priority': return toFrontmatterEnum(raw, PRIORITIES, 'None');
		case 'reminder': return toFrontmatterOptionalEnum(raw, REMINDER_OVERRIDES);
		case 'strings': return toFrontmatterStringArray(raw);
		case 'link': return ctx.resolveLink(raw);
		case 'links': return asList(raw).map(ctx.resolveLink).filter((v): v is string => v !== null);
		case 'date': return toCalendarDate(raw);
		case 'number': return toFrontmatterNumber(toFrontmatterScalar(raw));
		case 'flag': return toFrontmatterBoolean(raw);
		case 'dates': return asList(raw).map((v) => toCalendarDate(v)).filter((v): v is string => v !== null);
		case 'derived': return undefined;
	}
}

/** Decode every stored field of a note's frontmatter, tolerating Obsidian's retyped properties. */
export function readStoredFields(fm: Record<string, unknown>, ctx: ReadContext): StoredTaskFields {
	const out: Record<string, unknown> = {};
	for (const [field, p] of ENTRIES) {
		if (p.fmKey === null) continue;
		out[field] = decode(p.kind, fm[p.fmKey], ctx);
	}
	return out as unknown as StoredTaskFields;
}

// ── Write (creation) ──────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
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
					.filter((v): v is string => typeof v === 'string' && ISO_DATE.test(v))
					.map((v) => `'${v}'`),
			);
		case 'derived': return 'null';
	}
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
	for (const [field, p] of ENTRIES) {
		if (p.fmKey === null || p.onCreate === false) continue;
		const own = task[field];
		if (p.onCreate === 'when-set' && (own === null || own === undefined)) continue;
		const value = p.seed === 'blank' ? blankFor(p.kind) : p.seed === 'created' ? task.created : own;
		const encoded = encode(p.kind, value, resolveName);
		// List encodings carry their own leading space/newline; scalars need one.
		lines.push(/^[ \n]/.test(encoded) ? `${p.fmKey}:${encoded}` : `${p.fmKey}: ${encoded}`);
		if (field === 'name') lines.push('cssclasses: [ttask]');
	}
	lines.push('---');
	return lines.join('\n');
}
