import { describe, expect, it } from 'vitest';
import {
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
