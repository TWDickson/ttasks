// Pure preamble presets + output composition for the Share/Sync export tab. NO
// Obsidian imports (boundary-tested).
//
// Why this exists: pasting a raw JSON blob into a chat AI works, but the reply
// quality depends almost entirely on the framing sentence in front of it. Rather
// than making the user retype that framing every time, the export tab offers a
// few named presets (editable), and this module decides how the preamble and the
// JSON are laid out for copying — some AIs take one big message, others want the
// prose in the message and the JSON as a separate paste/attachment.

import type { TaskJsonValidValues } from './taskJsonExport';

export type SharePreamblePresetId = 'review' | 'breakdown' | 'plan' | 'catchup' | 'none';

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
	'"meta.validValues" in the JSON — if none fits, leave the field unchanged and say so in prose.';

const ROUND_TRIP_RULE =
	'To propose changes, reply with a JSON object in the same shape ({ "tasks": [...] }), including ' +
	'only the tasks you are changing and only the fields you are changing on each. Read "meta" in the ' +
	'JSON for the exact contract (matching by "ref", the "action" key, dependencies, projects).';

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
): string {
	if (preset.id === 'none') return '';
	const parts = [preset.text, ROUND_TRIP_RULE, NO_NEW_VALUES_RULE];
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
	json: string,
	format: ShareOutputFormat,
): ShareOutputBlock[] {
	const prose = preamble.trim();
	if (format === 'json-only' || prose === '') {
		return [{ label: '', copyLabel: 'Copy to clipboard', text: json }];
	}
	if (format === 'separate') {
		return [
			{ label: 'Message', copyLabel: 'Copy message', text: prose },
			{ label: 'JSON', copyLabel: 'Copy JSON', text: json },
		];
	}
	return [{
		label: '',
		copyLabel: 'Copy to clipboard',
		text: `${prose}\n\n\`\`\`json\n${json}\n\`\`\``,
	}];
}
