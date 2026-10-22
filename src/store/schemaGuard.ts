/**
 * The unmigrated-vault tripwire (schema cutover). After the `ttask_*` rename the
 * plugin reads no old keys, so a vault that hasn't been through the one-shot
 * migration script (shipped in the `0.2.2` tag, deleted after) would show an empty board — and, worse,
 * new tasks created there would be the only new-format notes in an old-format
 * vault. This spots that state so the plugin can say so and refuse to write.
 *
 * It *recognises* the old shape; it never *reads* it. That's the difference
 * from legacy support.
 *
 * Pure module — no Obsidian imports.
 */
import { fmKey } from '../schema/taskPersistence';

export type NoteSchema = 'current' | 'legacy' | 'other';

/** The old plugin's marker keys, before the prefix. */
const LEGACY_TYPE = 'type';
const LEGACY_NAME = 'name';

export function classifyNote(fm: Record<string, unknown> | null | undefined): NoteSchema {
	if (!fm) return 'other';
	if (Object.prototype.hasOwnProperty.call(fm, fmKey('name'))) return 'current';
	const type = fm[LEGACY_TYPE];
	if ((type === 'task' || type === 'project') && Object.prototype.hasOwnProperty.call(fm, LEGACY_NAME)) return 'legacy';
	return 'other';
}

export type VaultSchemaState =
	/** Nothing in the old format — normal operation. */
	| { kind: 'ok' }
	/** Only old-format notes: the script hasn't been run. Writes are refused. */
	| { kind: 'unmigrated'; legacy: number }
	/** Mostly migrated, but some old-format notes remain (e.g. synced in from an
	 *  out-of-date device). They're hidden until the script is re-run. */
	| { kind: 'stray-legacy'; legacy: number; current: number };

export function assessVault(frontmatters: Iterable<Record<string, unknown> | null | undefined>): VaultSchemaState {
	let legacy = 0;
	let current = 0;
	for (const fm of frontmatters) {
		const kind = classifyNote(fm);
		if (kind === 'legacy') legacy++;
		else if (kind === 'current') current++;
	}
	if (legacy === 0) return { kind: 'ok' };
	return current === 0 ? { kind: 'unmigrated', legacy } : { kind: 'stray-legacy', legacy, current };
}

export function schemaNotice(state: VaultSchemaState): string | null {
	switch (state.kind) {
		case 'ok': return null;
		case 'unmigrated':
			return `TTasks: your ${state.legacy} task note${state.legacy === 1 ? ' uses' : 's use'} the old property names, `
				+ 'so the board is empty and editing is paused to keep the vault consistent. Close Obsidian on every '
				+ 'device and run Scripts/migrate-prefixed-schema.mjs from the TTasks 0.2.2 source (see the README), then reopen.';
		case 'stray-legacy':
			return `TTasks: ${state.legacy} task note${state.legacy === 1 ? ' still uses' : 's still use'} the old property `
				+ 'names (probably synced from a device that hadn\'t updated) and are hidden. Re-run '
				+ 'Scripts/migrate-prefixed-schema.mjs (TTasks 0.2.2 source) to bring them back.';
	}
}
