import { describe, expect, it } from 'vitest';
import {
	GRAPH_RULE,
	IMPEDIMENT_RULE,
	NO_NEW_VALUES_RULE,
	SHARE_PREAMBLE_PRESETS,
	buildPreambleText,
	composeShareOutput,
	findPreamblePreset,
} from './sharePreamble';
import type { TaskJsonValidValues } from './taskJsonExport';

const VALID_VALUES: TaskJsonValidValues = {
	statuses: ['Active', 'In Progress', 'Done'],
	priorities: ['High', 'Medium', 'Low', 'None'],
	areas: ['Work'],
	labels: ['bug'],
};

describe('share preamble presets', () => {
	it('exposes a distinct id and label for every preset', () => {
		const ids = SHARE_PREAMBLE_PRESETS.map((preset) => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const preset of SHARE_PREAMBLE_PRESETS) expect(preset.label).not.toBe('');
	});

	it('finds a preset by id and falls back to the first one', () => {
		expect(findPreamblePreset('breakdown').label).toBe('Break down into subtasks');
		expect(findPreamblePreset('nope' as never)).toBe(SHARE_PREAMBLE_PRESETS[0]);
	});

	it('appends the round-trip and no-new-values rules to every real preset', () => {
		for (const preset of SHARE_PREAMBLE_PRESETS) {
			if (preset.id === 'none') continue;
			const text = buildPreambleText(preset);
			expect(text).toContain(preset.text);
			expect(text).toContain(NO_NEW_VALUES_RULE);
			expect(text).toContain('meta');
		}
	});

	it('spells out the vault statuses inline when valid values are supplied', () => {
		const text = buildPreambleText(findPreamblePreset('review'), VALID_VALUES);
		expect(text).toContain('Valid statuses in this vault: Active, In Progress, Done.');
	});

	it('omits the status line when no valid values are supplied', () => {
		expect(buildPreambleText(findPreamblePreset('review'))).not.toContain('Valid statuses in this vault');
	});

	it('emits nothing for the "none" preset', () => {
		expect(buildPreambleText(findPreamblePreset('none'), VALID_VALUES)).toBe('');
	});
});

describe('composeShareOutput', () => {
	const json = '{"tasks":[]}';

	const jsonOnlyBlock = { label: '', copyLabel: 'Copy to clipboard', text: json };

	it('fences the JSON under the preamble in a single block', () => {
		const blocks = composeShareOutput('Do the thing.', json, 'fenced');
		expect(blocks).toHaveLength(1);
		expect(blocks[0].text).toBe('Do the thing.\n\n```json\n{"tasks":[]}\n```');
	});

	it('splits into two labelled blocks when separate', () => {
		const blocks = composeShareOutput('Do the thing.', json, 'separate');
		expect(blocks.map((b) => b.label)).toEqual(['Message', 'JSON']);
		expect(blocks[1].text).toBe(json);
	});

	it('keeps JSON capitalised in the copy-button label', () => {
		expect(composeShareOutput('x', json, 'separate').map((b) => b.copyLabel))
			.toEqual(['Copy message', 'Copy JSON']);
	});

	it('returns the bare JSON for json-only', () => {
		expect(composeShareOutput('Do the thing.', json, 'json-only')).toEqual([jsonOnlyBlock]);
	});

	it('collapses to JSON-only when the preamble is blank or whitespace', () => {
		for (const format of ['fenced', 'separate'] as const) {
			expect(composeShareOutput('   \n ', json, format)).toEqual([jsonOnlyBlock]);
		}
	});

	it('trims surrounding whitespace off the preamble', () => {
		expect(composeShareOutput('  Hello.  ', json, 'separate')[0].text).toBe('Hello.');
	});
});

describe('graph framing', () => {
	// Without this, a model reads the export as a flat to-do list and advises on
	// each row in isolation — reordering work that has a fixed prerequisite chain.
	it('tells the model the tasks are a dependency graph, in every real preset', () => {
		for (const preset of SHARE_PREAMBLE_PRESETS) {
			const text = buildPreambleText(preset, VALID_VALUES);
			if (preset.id === 'none') {
				expect(text).toBe('');
				continue;
			}
			expect(text).toContain(GRAPH_RULE);
			expect(text).toContain(IMPEDIMENT_RULE);
			expect(text).toMatch(/depends_on/);
			expect(text).toMatch(/acyclic/i);
		}
	});
});

describe('format and notes warnings', () => {
	const preset = findPreamblePreset('review');

	it('says nothing about TOON for a JSON export', () => {
		expect(buildPreambleText(preset, VALID_VALUES)).not.toMatch(/TOON/);
	});

	it('explains the TOON shape and still demands a JSON reply', () => {
		const text = buildPreambleText(preset, VALID_VALUES, { payloadFormat: 'toon' });
		expect(text).toMatch(/TOON/);
		expect(text).toMatch(/tasks\[N\]/);
		expect(text).toMatch(/Reply in JSON, not TOON/i);
	});

	it('warns against sending back a body it only saw truncated', () => {
		for (const notesPolicy of ['summary', 'none'] as const) {
			const text = buildPreambleText(preset, VALID_VALUES, { notesPolicy });
			expect(text).toMatch(/Do not send "notes" back/i);
		}
	});

	it('stays quiet about note bodies when they are sent in full', () => {
		expect(buildPreambleText(preset, VALID_VALUES, { notesPolicy: 'full' })).not.toMatch(/Do not send "notes"/i);
	});
});

describe('composeShareOutput — payload format', () => {
	it('fences TOON as toon and labels the block TOON', () => {
		const [block] = composeShareOutput('Message.', 'tasks[1]{ref}:', 'fenced', 'toon');
		expect(block.text).toContain('```toon\n');

		const [, data] = composeShareOutput('Message.', 'tasks[1]{ref}:', 'separate', 'toon');
		expect(data.label).toBe('TOON');
		expect(data.copyLabel).toBe('Copy TOON');
	});

	it('still says JSON when no format is given', () => {
		const [, data] = composeShareOutput('Message.', '{}', 'separate');
		expect(data.copyLabel).toBe('Copy JSON');
	});
});
