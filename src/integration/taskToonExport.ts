// Pure task-document → TOON serializer. NO Obsidian imports (boundary-tested).
//
// TOON (https://github.com/toon-format/toon) encodes the JSON data model with
// YAML-ish nesting plus a CSV-like table for uniform object arrays:
//
//   tasks[100]{ref,name,status}:
//     024b10,Setup Reporting Layer,Future
//
// It only pays off when that tabular form actually engages, and engaging it has
// two hard preconditions the raw export document fails:
//
//   1. Every row needs the SAME keys. The 'ai' export prunes empty fields, so
//      rows are ragged — measured on a real 100-task export, TOON over the
//      document as-is saved 7%, and filling the keys while leaving arrays alone
//      saved 0.5%. Not worth a format change.
//   2. Every cell must be a scalar. `labels` and `depends_on` are arrays and
//      `notes` is a multi-line markdown body, so they have to leave the table:
//      the two arrays are joined with ` | `, the bodies move to a sidecar map
//      keyed by ref.
//
// With both applied the same export drops 39,278 → 32,065 tokens (-18%), and
// -85% when combined with `notesPolicy: 'none'`. That flattening is why this is
// a separate serializer rather than a switch inside taskJsonExport: it is a
// different shape on the wire, and the receiving AI is told so via `meta.format`.
//
// Export only, deliberately. A reply comes back sparse — a few tasks, a few
// fields each — which cannot be tabular, so TOON is actually LARGER than
// minified JSON there (129 vs 103 tokens on a 5-entry reply), and its decoder is
// strict: a miscounted [N], a 4-space indent, or an unquoted comma throws and
// takes the whole paste with it. Imports stay JSON.

import { encode as toonEncode } from '@toon-format/toon';
import type { ExportedTask, NotesPolicy, TaskJsonDocument, TaskJsonValidValues } from './taskJsonExport';
import { buildTaskJsonDocument } from './taskJsonExport';
import type { DerivedStateContext } from './taskDerivedState';
import type { Task } from '../types';

/** Separator for array fields flattened into a table cell. */
export const TOON_LIST_SEPARATOR = ' | ';

/**
 * Column order for the task table. Fixed rather than derived from the data so
 * the layout doesn't shift between exports — and so a column the current
 * selection happens not to use still appears (empty), which reads as "this field
 * exists and is unset" rather than "this field doesn't exist".
 */
export const TOON_TASK_COLUMNS = [
	'ref', 'type', 'name', 'area', 'status', 'priority', 'labels', 'parent',
	'depends_on', 'impeded', 'impeded_by', 'in_cycle',
	'start_date', 'due_date', 'scheduled_start', 'scheduled_end',
	'estimated_days', 'completed',
	'assigned_to', 'blocked_reason', 'pomodoro_count', 'focused_minutes',
] as const;

type ToonColumn = (typeof TOON_TASK_COLUMNS)[number];

const ARRAY_COLUMNS = new Set<ToonColumn>(['labels', 'depends_on', 'impeded_by']);

/** How the TOON shape differs from the JSON one, stated inside the payload itself. */
export const TOON_FORMAT_NOTE =
	'This payload is TOON, not JSON. "tasks[N]{col,col,…}:" gives the row count and column order; each ' +
	'line after it is one entry with its values in that order. Three columns hold lists in a single ' +
	`cell, split by "${TOON_LIST_SEPARATOR.trim()}": "labels", "depends_on" and "impeded_by" (empty ` +
	'cell means none). Note bodies are not in the table — they are under "notes", keyed by ref. ' +
	'REPLY IN JSON, not TOON: send { "tasks": [ … ] } with "labels" and "depends_on" as JSON arrays.';

/** The TOON-shaped payload: a flat task table plus a ref-keyed notes sidecar. */
export interface ToonPayload {
	schemaVersion: number;
	generatedAt: string;
	mode: string;
	meta?: Record<string, unknown>;
	taskCount: number;
	tasks: Array<Record<ToonColumn, string | number | boolean | null>>;
	/** Present only when at least one task has a body. */
	notes?: Record<string, string>;
}

function cell(value: unknown, column: ToonColumn): string | number | boolean | null {
	if (ARRAY_COLUMNS.has(column)) {
		return Array.isArray(value) ? value.join(TOON_LIST_SEPARATOR) : (value ?? '') as string;
	}
	if (value === undefined) return null;
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	return String(value);
}

/**
 * Reshape an export document into the tabular payload. Pure and separately
 * testable — the flattening is the part worth pinning down, not the encoding.
 */
export function toToonPayload(doc: TaskJsonDocument): ToonPayload {
	const rows = doc.tasks.map((task) => {
		const row = {} as Record<ToonColumn, string | number | boolean | null>;
		for (const column of TOON_TASK_COLUMNS) {
			row[column] = cell((task as unknown as Record<string, unknown>)[column], column);
		}
		return row;
	});

	const notes: Record<string, string> = {};
	doc.tasks.forEach((task: ExportedTask, index) => {
		const body = (task.notes ?? '').trim();
		if (body === '') return;
		// Fall back to the row index when a ref is absent so a body is never
		// silently dropped, and never collides with a real ref.
		notes[task.ref ?? task.id ?? `#${index}`] = task.notes;
	});

	return {
		schemaVersion: doc.schemaVersion,
		generatedAt: doc.generatedAt,
		mode: doc.mode,
		...(doc.meta ? { meta: { ...doc.meta, format: TOON_FORMAT_NOTE } } : {}),
		taskCount: doc.taskCount,
		tasks: rows,
		...(Object.keys(notes).length > 0 ? { notes } : {}),
	};
}

/** Serialize an already-built export document as TOON. */
export function serializeDocumentToToon(doc: TaskJsonDocument): string {
	return toonEncode(toToonPayload(doc) as unknown as Parameters<typeof toonEncode>[0]);
}

/** Convenience mirror of `serializeTasksToJson` for the TOON payload format. */
export function serializeTasksToToon(
	tasks: Task[],
	generatedAt: string,
	validValues?: TaskJsonValidValues,
	notesPolicy: NotesPolicy = 'full',
	derivedContext?: DerivedStateContext,
): string {
	// 'ai' only — the flattening is lossy for the vault-path links a 'full'
	// export exists to round-trip.
	return serializeDocumentToToon(
		buildTaskJsonDocument(tasks, 'ai', generatedAt, validValues, notesPolicy, derivedContext),
	);
}
