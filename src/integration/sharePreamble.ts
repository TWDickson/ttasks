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

export type SharePreamblePresetId = 'review' | 'breakdown' | 'plan' | 'catchup' | 'none';

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
	'Do not invent new statuses, priorities, areas, or labels. Use only the values listed in ' +
	'"meta.validValues" in the data — if none fits, leave the field unchanged and say so in prose.';

const ROUND_TRIP_RULE =
	'To propose changes, reply with a JSON object in the same shape ({ "tasks": [...] }), including ' +
	'only the tasks you are changing and only the fields you are changing on each. Read "meta" in the ' +
	'data for the exact contract (matching by "ref", the "action" key, dependencies, projects).';

/**
 * The shape rule. Without it a model reads the export as a flat to-do list and
 * advises on each row in isolation — reordering work that has a fixed
 * prerequisite chain, or calling a task stalled when it is simply waiting on its
 * blocker. Stated in the prose as well as in `meta.graph` because prose is what
 * actually steers the reply.
 */
export const GRAPH_RULE =
	'These tasks are a dependency GRAPH, not a flat list. "depends_on" names the tasks that must finish ' +
	'first, "parent" names the project a task belongs to, and "blocks" is just the reverse view of ' +
	'"depends_on". Reason over the whole graph: nothing is workable until its dependencies are done, a ' +
	'date or status change ripples to everything downstream, and a project runs as long as its longest ' +
	'chain. Keep the graph acyclic and say so explicitly when a change moves work that depends on it.';

/** Told to the model when the data block is TOON rather than JSON. */
const TOON_FORMAT_RULE =
	'The data below is TOON, a compact tabular encoding: "tasks[N]{col,col,…}:" gives the row count and ' +
	'column order, then one line per task. In the "labels" and "depends_on" columns a single cell holds a ' +
	'list separated by " | ", and note bodies live under "notes" keyed by ref rather than in the table. ' +
	'Reply in JSON, not TOON.';

/** Told to the model when note bodies were shortened or dropped on the way out. */
function notesPolicyRule(policy: NotesPolicy): string | null {
	if (policy === 'summary') {
		return 'Note bodies are TRUNCATED here (a trailing "…" marks a cut body). Do not send "notes" back — ' +
			'it would overwrite the real body with this fragment. Suggest body edits in prose instead.';
	}
	if (policy === 'none') {
		return 'Note bodies are NOT included in this export — you are seeing task fields only. Do not send ' +
			'"notes" back, and say so if a question really needs the body text.';
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
			'Below is a set of tasks exported from my task manager. Review them and tell me what stands out: ' +
			'anything stale, mis-prioritised, blocked without a reason, or missing a due date. ' +
			'Then propose concrete edits.',
	},
	{
		id: 'breakdown',
		label: 'Break down into subtasks',
		text:
			'Below is a set of tasks/projects exported from my task manager. Break the larger ones down into ' +
			'concrete, actionable subtasks. Put each new task under the right project with "parent", and use ' +
			'"depends_on" to express the order work has to happen in.',
	},
	{
		id: 'plan',
		label: 'Plan my week',
		text:
			'Below is a set of tasks exported from my task manager. Help me plan: propose a realistic order of ' +
			'work for the coming week and set "start_date"/"due_date" accordingly. Respect existing ' +
			'"depends_on" order, and flag anything that looks over-committed rather than silently squeezing it in.',
	},
	{
		id: 'catchup',
		label: 'Status catch-up',
		text:
			'Below is a set of tasks exported from my task manager. I will describe what I actually got done; ' +
			'update the matching tasks (status, completed date, notes-worthy blockers) to reflect it. ' +
			'Ask me about anything ambiguous instead of guessing.',
	},
	{ id: 'none', label: 'No preamble', text: '' },
];

export function findPreamblePreset(id: SharePreamblePresetId): SharePreamblePreset {
	return SHARE_PREAMBLE_PRESETS.find((preset) => preset.id === id) ?? SHARE_PREAMBLE_PRESETS[0];
}

/**
 * The full preamble text for a preset: its body plus the two rules that apply to
 * every preset. Returns '' for the 'none' preset so it truly emits nothing.
 *
 * `validValues` is optional; when supplied, the allowed statuses are spelled out
 * inline (an AI following prose is more reliable than one that has to go find
 * `meta.validValues` in a long document).
 */
export function buildPreambleText(
	preset: SharePreamblePreset,
	validValues?: TaskJsonValidValues,
	context: PreambleContext = {},
): string {
	if (preset.id === 'none') return '';
	const parts = [preset.text, GRAPH_RULE, ROUND_TRIP_RULE, NO_NEW_VALUES_RULE];
	if (context.payloadFormat === 'toon') parts.push(TOON_FORMAT_RULE);
	const notesRule = notesPolicyRule(context.notesPolicy ?? 'full');
	if (notesRule) parts.push(notesRule);
	if (validValues && validValues.statuses.length > 0) {
		parts.push(`Valid statuses in this vault: ${validValues.statuses.join(', ')}.`);
	}
	return parts.join('\n\n');
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
