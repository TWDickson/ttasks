import { describe, expect, it } from 'vitest';
import {
	DATES_RULE,
	GRAPH_RULE,
	buildInteropRules,
	builtinPreset,
	isBuiltinPresetId,
	isPresetModified,
	mergePresetLibrary,
	newCustomPresetId,
	presetAsk,
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

	// 'none' means "no prompt of my own", not "no contract" — a reply still has to
	// come back in a shape the importer can apply.
	it('emits the interop contract but no ask for the "none" preset', () => {
		const text = buildPreambleText(findPreamblePreset('none'), VALID_VALUES);
		expect(text).toContain(GRAPH_RULE);
		expect(text).toContain(DATES_RULE);
		// No preset body leaked in ahead of it.
		expect(text.startsWith(GRAPH_RULE)).toBe(true);
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
			expect(text).toContain(GRAPH_RULE);
			expect(text).toContain(IMPEDIMENT_RULE);
			expect(text).toMatch(/depends_on/);
			expect(text).toMatch(/cycle/i);
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


describe('preset library', () => {
	const bundled = SHARE_PREAMBLE_PRESETS[0];

	it('knows which presets are bundled', () => {
		expect(isBuiltinPresetId('review')).toBe(true);
		expect(isBuiltinPresetId('custom-1')).toBe(false);
		expect(builtinPreset('review')?.label).toBe(bundled.label);
		expect(builtinPreset('custom-1')).toBeNull();
	});

	it('flags a bundled preset as modified only once it differs', () => {
		expect(isPresetModified({ ...bundled })).toBe(false);
		expect(isPresetModified({ ...bundled, text: 'reworded' })).toBe(true);
		expect(isPresetModified({ ...bundled, label: 'Renamed' })).toBe(true);
		// A custom preset has no default to differ from.
		expect(isPresetModified({ id: 'custom-1', label: 'Mine', text: 'x' })).toBe(false);
	});

	it('keeps user edits and custom presets when merging against the bundle', () => {
		const stored = [
			{ id: 'review', label: 'My review', text: 'my wording' },
			{ id: 'custom-1', label: 'Mine', text: 'ask' },
		];
		const merged = mergePresetLibrary(stored);
		expect(merged.find((p) => p.id === 'review')).toEqual(stored[0]);
		expect(merged.find((p) => p.id === 'custom-1')).toEqual(stored[1]);
	});

	// A preset added in a later release has to appear for someone whose stored
	// library predates it, without reshuffling what they already have.
	it('re-seeds a bundled preset missing from the stored library', () => {
		const merged = mergePresetLibrary([{ id: 'custom-1', label: 'Mine', text: 'ask' }]);
		for (const preset of SHARE_PREAMBLE_PRESETS) {
			expect(merged.some((p) => p.id === preset.id)).toBe(true);
		}
		expect(merged[merged.length - 1].id).toBe('custom-1');
	});

	it('generates a collision-free custom id', () => {
		expect(newCustomPresetId([])).toBe('custom-1');
		expect(newCustomPresetId([{ id: 'custom-1', label: '', text: '' }])).toBe('custom-2');
	});
});

describe('ask / interop split', () => {
	it('keeps the interop rules out of the ask', () => {
		const preset = SHARE_PREAMBLE_PRESETS[0];
		expect(presetAsk(preset)).toBe(preset.text.trim());
		expect(presetAsk(preset)).not.toContain(GRAPH_RULE);
		expect(presetAsk({ id: 'none', label: 'No preamble', text: '' })).toBe('');
	});

	// The interop half is export-derived, not user-owned: it has to change with
	// the payload format and notes policy, which is why it isn't a setting.
	it('varies the interop rules with the export options', () => {
		const plain = buildInteropRules(undefined, {});
		const toon = buildInteropRules(undefined, { payloadFormat: 'toon' });
		expect(toon.length).toBe(plain.length + 1);
		expect(toon.join(' ')).toMatch(/TOON/);
		const truncated = buildInteropRules(undefined, { notesPolicy: 'summary' });
		expect(truncated.join(' ')).toMatch(/cut short/i);
	});

	it('always carries the graph and impediment rules', () => {
		const rules = buildInteropRules(undefined, {});
		expect(rules).toContain(GRAPH_RULE);
		expect(rules).toContain(IMPEDIMENT_RULE);
	});
});


describe('date advice', () => {
	// The model kept inventing due dates because a blank one reads as missing
	// data, and the old 'review' preset literally asked it to hunt for them.
	it('tells the model blank dates are deliberate and how scheduling works', () => {
		expect(DATES_RULE).toMatch(/NOT missing data/);
		expect(DATES_RULE).toMatch(/estimated_days/);
		expect(DATES_RULE).toMatch(/external deadline/i);
		expect(buildInteropRules()).toContain(DATES_RULE);
	});

	it('no bundled prompt asks the model to look for missing due dates', () => {
		for (const preset of SHARE_PREAMBLE_PRESETS) {
			expect(preset.text).not.toMatch(/missing a due date/i);
		}
	});
});
