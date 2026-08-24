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
	'Use only the statuses, priorities, areas and labels listed in "meta.validValues". Never invent a ' +
	'new one. If none fits, leave the field alone and say why in prose.';

const ROUND_TRIP_RULE =
	'Reply with JSON: { "tasks": [ ... ] }. Include only the entries you are changing, and on each one ' +
	'only the fields you are changing plus its "ref". "meta" in the data has the full contract and a ' +
	'worked example — follow it.';

/**
 * The shape rule. Without it a model reads the export as a flat to-do list and
 * advises on each row in isolation — reordering work that has a fixed
 * prerequisite chain, or calling a task stalled when it is simply waiting on its
 * blocker. Stated in the prose as well as in `meta.graph` because prose is what
 * actually steers the reply.
 */
export const GRAPH_RULE =
	'These are a dependency GRAPH, not a flat list. "depends_on" names what must finish first. "parent" ' +
	'names the project an entry belongs to. "blocks" is just the reverse of "depends_on". Nothing is ' +
	'workable until its dependencies are done. Moving one entry\'s dates or status moves everything ' +
	'downstream of it, and a project takes as long as its longest chain. Never make a cycle. Say so ' +
	'when a change you propose moves work that depends on it.';

/**
 * The one graph fact a model reliably misses: Blocked/Hold are not local. Without
 * it a reply calls a task workable while its blocker is stuck, or "helpfully"
 * stamps Blocked down the whole chain — which is wrong twice over, because TTasks
 * derives downstream impediment from the graph and never stores it (see
 * `computeImpediments` in src/query/taskImpediment.ts).
 */
export const IMPEDIMENT_RULE =
	'Blocked and Hold spread downstream. If a task is Blocked, everything depending on it is stuck too. ' +
	'Hold spreads the same way but is weaker, and Blocked wins if both reach a task. TTasks works this ' +
	'out by itself. Set Blocked or Hold ONLY on the task that is actually stuck, never on the ones ' +
	'waiting behind it. A task waiting on a stuck blocker is not idle.';

/** Told to the model when the data block is TOON rather than JSON. */
const TOON_FORMAT_RULE =
	'The data below is TOON, not JSON. "tasks[N]{col,col,…}:" gives the row count and column order, then ' +
	'one line per entry. In "labels" and "depends_on" one cell holds a list split by " | ". Note bodies ' +
	'are under "notes", keyed by ref. Reply in JSON, not TOON.';

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
			'stale, mis-prioritised, blocked with no reason given, or missing a due date. Then propose ' +
			'concrete edits.',
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
	{ id: 'none', label: 'No preamble', text: '' },
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
	const rules = [GRAPH_RULE, IMPEDIMENT_RULE, ROUND_TRIP_RULE, NO_NEW_VALUES_RULE];
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
 * Returns '' for the 'none' preset so it truly emits nothing — an empty ask
 * means the user wants raw data, and shipping the contract alone would be a
 * preamble they explicitly turned off.
 */
export function buildPreambleText(
	preset: SharePreamblePreset,
	validValues?: TaskJsonValidValues,
	context: PreambleContext = {},
): string {
	const ask = presetAsk(preset);
	if (ask === '') return '';
	return [ask, ...buildInteropRules(validValues, context)].join('\n\n');
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
