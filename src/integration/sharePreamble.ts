// Pure preamble presets + output composition for the Share/Sync export tab. NO
// Obsidian imports (boundary-tested).
//
// Why this exists: pasting a raw JSON blob into a chat AI works, but the reply
// quality depends almost entirely on the framing sentence in front of it. Rather
// than making the user retype that framing every time, the export tab offers a
// few named presets (editable), and this module decides how the preamble and the
// JSON are laid out for copying — some AIs take one big message, others want the
// prose in the message and the JSON as a separate paste/attachment.

import type { NotesPolicy, TaskJsonValidValues } from './taskJsonExport';

/**
 * Bundled preset ids. Custom presets get generated ids, so a stored preset id is
 * a plain string — use `isBuiltinPresetId` rather than assuming the union.
 */
export type BuiltinPreamblePresetId = 'review' | 'breakdown' | 'plan' | 'catchup' | 'align' | 'none';

/** Any preset id: a bundled one, or a user-created `custom-*`. */
export type SharePreamblePresetId = string;

/**
 * Wire format of the data block. 'json' is the round-trip default; 'toon' is a
 * denser export-only encoding (see taskToonExport) that still asks for a JSON
 * reply, so the preamble has to say which one is going out.
 */
export type SharePayloadFormat = 'json' | 'toon';

export interface SharePreamblePreset {
	id: SharePreamblePresetId;
	/** Dropdown label. */
	label: string;
	/** The preamble body. Empty for 'none' (JSON with no framing). */
	text: string;
}

/**
 * How the preamble and the JSON are packaged for copying.
 *  - 'fenced'    — one copiable block: preamble, then the JSON in a ```json fence.
 *  - 'separate'  — two independently copiable blocks (prose, then raw JSON).
 *  - 'json-only' — just the JSON, no preamble (the pre-preamble behaviour).
 */
export type ShareOutputFormat = 'fenced' | 'separate' | 'json-only';

/**
 * The one instruction that must survive every preset: the receiving AI picks from
 * this vault's configured values instead of inventing its own. An invented status
 * doesn't fail loudly on import — it lands as an unrecognised string — so this is
 * stated in the prose as well as in the document's `meta.validValues`.
 */
export const NO_NEW_VALUES_RULE =
	'VALUES: for status, priority, area, labels use only what "meta.validValues" lists. Never invent ' +
	'one. If none fits, leave the field unchanged and explain in prose.';

const ROUND_TRIP_RULE =
	'REPLY: JSON only, {"tasks":[...]}. One object per changed entry: its "ref" plus only the fields you ' +
	'changed. Omit entries you did not change. Copy the shape in "meta.example".';

/**
 * The shape rule. Without it a model reads the export as a flat to-do list and
 * advises on each row in isolation — reordering work that has a fixed
 * prerequisite chain, or calling a task stalled when it is simply waiting on its
 * blocker. Stated in the prose as well as in `meta.graph` because prose is what
 * actually steers the reply.
 */
export const GRAPH_RULE =
	'GRAPH: this is a dependency graph, not a list. "depends_on" = must finish first. "parent" = owning ' +
	'project. "blocks" = reverse of depends_on, read-only. A task is not workable until its depends_on ' +
	'are done. A project takes as long as its longest chain. Never create a cycle. If a change moves ' +
	'work downstream, say so.';

/**
 * The rule that makes the derived fields legible, and the reason the two rules
 * below are now short. The export used to describe both algorithms and leave the
 * model to run them; it now ships the resolved answers (see `taskDerivedState`),
 * so the prose only has to point at them and say "don't recompute, don't return".
 */
export const DERIVED_RULE =
	'ALREADY WORKED OUT: "impeded"/"impeded_by" say an entry is stuck behind something upstream and what ' +
	'has to clear. "scheduled_start"/"scheduled_end" are the dates its dependency chain implies. ' +
	'"in_cycle" means it sits in a dependency loop and cannot be scheduled. Absent = does not apply. ' +
	'Read these instead of working them out yourself, and never send them back.';

/**
 * The one graph fact a model reliably misses: Blocked/Hold/Future are not local.
 * It no longer has to *infer* that — `impeded` states it per entry — so what
 * survives here is the half that governs the reply: don't stamp a status down
 * the chain, and don't mistake an impeded task for an idle one.
 */
export const IMPEDIMENT_RULE =
	'BLOCKED/HOLD/FUTURE: set these ONLY on the entry that is actually stuck, never on the ones waiting behind ' +
	'it — "impeded" already marks those and TTasks recomputes it. An entry with "impeded" is not idle ' +
	'and does not need chasing; its blocker does.';

/**
 * Why blank dates are normal. Without this a model reads `due_date: null` as
 * missing data and fills it in, which is actively harmful: an invented due date
 * overrides the schedule TTasks computes from the chain and pins everything
 * downstream of it. The schedule itself now travels as `scheduled_start`/
 * `scheduled_end`, so this no longer has to describe `resolveTaskDates` — only
 * to stop the model treating a blank as a gap.
 */
export const DATES_RULE =
	'DATES: most entries have no dates on purpose, and a blank "start_date"/"due_date" is NOT missing ' +
	'data — "scheduled_start"/"scheduled_end" already say when the chain puts the work. Do not fill ' +
	'blank dates in, and do not report them as a problem. To make something take longer, set ' +
	'"estimated_days". Set "due_date" ONLY for a real external deadline — it overrides the computed ' +
	'schedule and pins everything downstream of it.';

/** Told to the model when the data block is TOON rather than JSON. */
const TOON_FORMAT_RULE =
	'FORMAT: the data is TOON, not JSON. "tasks[N]{col,col,…}:" gives the row count and column order; ' +
	'each later line is one entry in that order. "labels", "depends_on" and "impeded_by" hold lists in ' +
	'one cell split by " | ". Note bodies are under "notes", keyed by ref. Reply in JSON, not TOON.';

/** Told to the model when note bodies were shortened or dropped on the way out. */
function notesPolicyRule(policy: NotesPolicy): string | null {
	if (policy === 'summary') {
		return 'Note bodies here are cut short (a trailing "…" marks a cut body). Do NOT send "notes" back — ' +
			'it would overwrite the real body with this fragment. Put body edits in prose instead.';
	}
	if (policy === 'none') {
		return 'Note bodies are not included here — you are seeing fields only. Do NOT send "notes" back. ' +
			'Say so if a question really needs the body text.';
	}
	return null;
}

/** Optional context that changes what the preamble has to warn about. */
export interface PreambleContext {
	payloadFormat?: SharePayloadFormat;
	notesPolicy?: NotesPolicy;
}

export const SHARE_PREAMBLE_PRESETS: SharePreamblePreset[] = [
	{
		id: 'review',
		label: 'Review & advise',
		text:
			'Below are tasks from my task manager. Review them and tell me what stands out: anything ' +
			'stale, mis-prioritised, or blocked with no reason given. Then propose concrete edits.',
	},
	{
		id: 'breakdown',
		label: 'Break down into subtasks',
		text:
			'Below are tasks and projects from my task manager. Break the big ones into concrete, ' +
			'actionable subtasks. Put each new task under the right project with "parent", and use ' +
			'"depends_on" to say what order the work happens in.',
	},
	{
		id: 'plan',
		label: 'Plan my week',
		text:
			'Below are tasks from my task manager. Propose a realistic order of work for the coming week ' +
			'and set "start_date" and "due_date" to match. Respect the existing "depends_on" order. Flag ' +
			'anything over-committed instead of quietly squeezing it in.',
	},
	{
		id: 'catchup',
		label: 'Status catch-up',
		text:
			'Below are tasks from my task manager. I will tell you what I actually got done; update the ' +
			'matching entries (status, completed date, any blocker worth noting) to match. Ask me about ' +
			'anything unclear instead of guessing.',
	},
	{
		id: 'align',
		label: 'Align titles to project vocabulary',
		text:
			'Below are projects and tasks from my task manager. The projects are the source of truth for ' +
			'naming. Rewrite vague or ad-hoc task titles to use the same vocabulary as the project they ' +
			'belong to, and propose a "parent" for any task that clearly belongs to a project but has ' +
			'none. Rename a project too if its own title is unclear. Keep every rename with its "ref".',
	},
	{ id: 'none', label: 'No prompt (contract only)', text: '' },
];

export function findPreamblePreset(id: SharePreamblePresetId): SharePreamblePreset {
	return SHARE_PREAMBLE_PRESETS.find((preset) => preset.id === id) ?? SHARE_PREAMBLE_PRESETS[0];
}

/**
 * The full preamble text for a preset: its body plus the rules that apply to
 * every preset. Returns '' for the 'none' preset so it truly emits nothing.
 *
 * `validValues` is optional; when supplied, the allowed statuses are spelled out
 * inline (an AI following prose is more reliable than one that has to go find
 * `meta.validValues` in a long document).
 */
/**
 * The interop rules: how to read the data and how to reply. **Not user
 * configurable**, and deliberately so — they describe the wire contract and the
 * export's own options (payload format, notes policy, this vault's enums), so a
 * user editing them would only ever desync the reply from what the importer can
 * actually apply. They are also partly *dynamic*: the TOON and notes-policy
 * lines appear only when those options are in play.
 *
 * Kept separate from the preset's ask so the two can't bleed into each other —
 * the settings tab edits asks, and nothing there can reach these.
 */
export function buildInteropRules(
	validValues?: TaskJsonValidValues,
	context: PreambleContext = {},
): string[] {
	const rules = [GRAPH_RULE, DERIVED_RULE, IMPEDIMENT_RULE, DATES_RULE, ROUND_TRIP_RULE, NO_NEW_VALUES_RULE];
	if (context.payloadFormat === 'toon') rules.push(TOON_FORMAT_RULE);
	const notesRule = notesPolicyRule(context.notesPolicy ?? 'full');
	if (notesRule) rules.push(notesRule);
	if (validValues && validValues.statuses.length > 0) {
		rules.push(`Valid statuses in this vault: ${validValues.statuses.join(', ')}.`);
	}
	return rules;
}

/**
 * The ask: what the user wants the agent to *do*. This is the half they own and
 * tune in settings; `''` for the 'none' preset.
 */
export function presetAsk(preset: SharePreamblePreset): string {
	return preset.id === 'none' ? '' : preset.text.trim();
}

/**
 * The full preamble: the preset's ask followed by the interop rules.
 *
 * The 'none' preset contributes no ask but still carries the interop rules: a
 * reply has to be applicable whether or not the user wrote a prompt.
 */
export function buildPreambleText(
	preset: SharePreamblePreset,
	validValues?: TaskJsonValidValues,
	context: PreambleContext = {},
): string {
	const ask = presetAsk(preset);
	const rules = buildInteropRules(validValues, context);
	// An empty ask means "no instructions of my own", not "no contract" — the
	// reply still has to come back in a shape the importer accepts, so the
	// interop half ships regardless.
	return (ask === '' ? rules : [ask, ...rules]).join('\n\n');
}

/** One independently copiable chunk of the composed output. */
export interface ShareOutputBlock {
	/** Short heading for the chunk ('' when the output is a single block). */
	label: string;
	/** Ready-to-render button text — kept here so casing ("JSON", not "json") lives in one place. */
	copyLabel: string;
	text: string;
}

/**
 * Lay out the preamble + JSON per the chosen format. Always returns at least one
 * block; an empty preamble collapses every format to JSON-only so a blank custom
 * preamble can't emit a stray fence or an empty copy field.
 */
export function composeShareOutput(
	preamble: string,
	payload: string,
	format: ShareOutputFormat,
	payloadFormat: SharePayloadFormat = 'json',
): ShareOutputBlock[] {
	const prose = preamble.trim();
	// Casing of the format name lives here so the fence, the block heading, and
	// the button all agree.
	const name = payloadFormat === 'toon' ? 'TOON' : 'JSON';
	if (format === 'json-only' || prose === '') {
		return [{ label: '', copyLabel: 'Copy to clipboard', text: payload }];
	}
	if (format === 'separate') {
		return [
			{ label: 'Message', copyLabel: 'Copy message', text: prose },
			{ label: name, copyLabel: `Copy ${name}`, text: payload },
		];
	}
	return [{
		label: '',
		copyLabel: 'Copy to clipboard',
		text: `${prose}\n\n\`\`\`${payloadFormat}\n${payload}\n\`\`\``,
	}];
}


// ── Preset library ───────────────────────────────────────────────────────────
// The bundled presets above are *defaults*, not the list. Users tune them, add
// their own, and restore a bundled one they've edited — so the live list lives
// in settings and this is what keeps it honest against the bundle.

/** Ids of the presets TTasks ships. */
export const BUILTIN_PRESET_IDS: readonly string[] = SHARE_PREAMBLE_PRESETS.map((preset) => preset.id);

/** True when `id` names a preset TTasks ships (so it can be restored, not deleted). */
export function isBuiltinPresetId(id: string): boolean {
	return BUILTIN_PRESET_IDS.includes(id);
}

/** The shipped definition of a bundled preset, or null for a custom one. */
export function builtinPreset(id: string): SharePreamblePreset | null {
	return SHARE_PREAMBLE_PRESETS.find((preset) => preset.id === id) ?? null;
}

/**
 * True when a bundled preset has been edited away from what TTasks ships — the
 * condition for offering "Restore default". Always false for a custom preset,
 * which has no default to go back to.
 */
export function isPresetModified(preset: SharePreamblePreset): boolean {
	const bundled = builtinPreset(preset.id);
	if (!bundled) return false;
	return preset.label !== bundled.label || preset.text !== bundled.text;
}

/**
 * Reconcile a stored list against the bundle: every bundled preset is present
 * (re-seeded if the user's stored list predates it), user edits win, and custom
 * presets are kept. Bundled order first, then custom in stored order — so adding
 * a preset in a later release doesn't reshuffle someone's list.
 */
export function mergePresetLibrary(stored: SharePreamblePreset[]): SharePreamblePreset[] {
	const byId = new Map(stored.map((preset) => [preset.id, preset]));
	const bundled = SHARE_PREAMBLE_PRESETS.map((preset) => byId.get(preset.id) ?? { ...preset });
	const custom = stored.filter((preset) => !isBuiltinPresetId(preset.id));
	return [...bundled, ...custom];
}

/** A fresh, collision-free id for a user-created preset. */
export function newCustomPresetId(existing: SharePreamblePreset[]): string {
	const taken = new Set(existing.map((preset) => preset.id));
	for (let n = 1; ; n += 1) {
		const id = `custom-${n}`;
		if (!taken.has(id)) return id;
	}
}

/** Look a preset up in a live library, falling back to its first entry. */
export function findPresetIn(presets: SharePreamblePreset[], id: string): SharePreamblePreset {
	return presets.find((preset) => preset.id === id) ?? presets[0] ?? SHARE_PREAMBLE_PRESETS[0];
}
