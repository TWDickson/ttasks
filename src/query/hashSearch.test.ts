import { describe, expect, it } from 'vitest';
import {
	MIN_BARE_HEX_LENGTH,
	filterBySearch,
	matchesSearchTerm,
	parseSearchTerm,
	type SearchableTask,
} from './hashSearch';

function task(id: string, name: string, notes = ''): SearchableTask {
	return { id, name, notes };
}

describe('parseSearchTerm', () => {
	it('returns null for empty and whitespace-only input', () => {
		expect(parseSearchTerm('')).toBeNull();
		expect(parseSearchTerm('   ')).toBeNull();
		expect(parseSearchTerm('\t\n')).toBeNull();
	});

	it('lower-cases and trims the text', () => {
		expect(parseSearchTerm('  Fix Roof  ')).toEqual({
			text: 'fix roof',
			idPrefix: null,
			idOnly: false,
		});
	});

	it('adds an id prefix for a bare hex term at the minimum length', () => {
		expect(parseSearchTerm('a1b')).toEqual({ text: 'a1b', idPrefix: 'a1b', idOnly: false });
		expect(parseSearchTerm('a1b2c3')).toEqual({
			text: 'a1b2c3',
			idPrefix: 'a1b2c3',
			idOnly: false,
		});
	});

	it('does not add an id prefix for bare hex shorter than the minimum', () => {
		expect(MIN_BARE_HEX_LENGTH).toBe(3);
		expect(parseSearchTerm('a')?.idPrefix).toBeNull();
		expect(parseSearchTerm('ab')?.idPrefix).toBeNull();
	});

	it('does not add an id prefix for non-hex terms', () => {
		expect(parseSearchTerm('roof')?.idPrefix).toBeNull();
		expect(parseSearchTerm('a1b2g3')?.idPrefix).toBeNull();
		expect(parseSearchTerm('a1 b2')?.idPrefix).toBeNull();
	});

	it('uppercases hex the same as lowercase', () => {
		expect(parseSearchTerm('A1B2C3')).toEqual({
			text: 'a1b2c3',
			idPrefix: 'a1b2c3',
			idOnly: false,
		});
	});

	it('treats a # sigil with valid hex as an id-only search', () => {
		expect(parseSearchTerm('#a1b2c3')).toEqual({ text: '', idPrefix: 'a1b2c3', idOnly: true });
	});

	it('allows the sigil form below the bare minimum length', () => {
		expect(parseSearchTerm('#a')).toEqual({ text: '', idPrefix: 'a', idOnly: true });
	});

	it('falls back to literal text for a # term that is not hex', () => {
		expect(parseSearchTerm('#bug')).toEqual({ text: '#bug', idPrefix: null, idOnly: false });
		expect(parseSearchTerm('#')).toEqual({ text: '#', idPrefix: null, idOnly: false });
	});
});

describe('matchesSearchTerm', () => {
	const roof = task('a1b2c3', 'Fix roof', 'call the roofer');

	it('matches on name substring', () => {
		expect(matchesSearchTerm(roof, parseSearchTerm('roo')!)).toBe(true);
	});

	it('matches on notes substring', () => {
		expect(matchesSearchTerm(roof, parseSearchTerm('roofer')!)).toBe(true);
	});

	it('matches on a full hash', () => {
		expect(matchesSearchTerm(roof, parseSearchTerm('a1b2c3')!)).toBe(true);
	});

	it('matches on a hash prefix', () => {
		expect(matchesSearchTerm(roof, parseSearchTerm('a1b')!)).toBe(true);
	});

	it('does not match a hash suffix or mid-run', () => {
		expect(matchesSearchTerm(roof, parseSearchTerm('b2c3')!)).toBe(false);
		expect(matchesSearchTerm(roof, parseSearchTerm('1b2')!)).toBe(false);
	});

	it('matches a hash prefix case-insensitively in both directions', () => {
		const upper = task('A1B2C3', 'Fix roof');
		expect(matchesSearchTerm(upper, parseSearchTerm('a1b')!)).toBe(true);
		expect(matchesSearchTerm(roof, parseSearchTerm('#A1B')!)).toBe(true);
	});

	it('ignores name and notes under the # sigil', () => {
		const decoy = task('999999', 'Task about a1b2c3', 'mentions a1b2c3');
		expect(matchesSearchTerm(decoy, parseSearchTerm('a1b2c3')!)).toBe(true);
		expect(matchesSearchTerm(decoy, parseSearchTerm('#a1b2c3')!)).toBe(false);
		expect(matchesSearchTerm(roof, parseSearchTerm('#a1b2c3')!)).toBe(true);
	});

	it('treats a missing notes field as empty rather than throwing', () => {
		const noNotes: SearchableTask = { id: 'a1b2c3', name: 'Fix roof' };
		expect(matchesSearchTerm(noNotes, parseSearchTerm('roof')!)).toBe(true);
		expect(matchesSearchTerm(noNotes, parseSearchTerm('missing')!)).toBe(false);
	});

	it('ORs the hash match with the text match rather than replacing it', () => {
		// "add" is both a real word and a valid hex prefix.
		const named = task('000000', 'Add a step');
		const hashed = task('add123', 'Unrelated');
		const term = parseSearchTerm('add')!;
		expect(matchesSearchTerm(named, term)).toBe(true);
		expect(matchesSearchTerm(hashed, term)).toBe(true);
	});
});

describe('filterBySearch', () => {
	const tasks = [
		task('a1b2c3', 'Fix roof'),
		task('a1ffff', 'Paint fence'),
		task('999999', 'Buy milk', 'from a1b2c3'),
	];

	it('returns the list unchanged for an empty search', () => {
		expect(filterBySearch(tasks, '')).toBe(tasks);
		expect(filterBySearch(tasks, '   ')).toBe(tasks);
	});

	it('narrows to the tasks sharing a hash prefix', () => {
		expect(filterBySearch(tasks, '#a1').map(t => t.name)).toEqual(['Fix roof', 'Paint fence']);
		expect(filterBySearch(tasks, '#a1b').map(t => t.name)).toEqual(['Fix roof']);
	});

	it('below the minimum length, a bare term is text-only — the sigil still works', () => {
		// "a1" is too short to imply a hash, so only the notes text match lands.
		expect(filterBySearch(tasks, 'a1').map(t => t.name)).toEqual(['Buy milk']);
		expect(filterBySearch(tasks, '#a1').map(t => t.name)).toEqual(['Fix roof', 'Paint fence']);
	});

	it('includes text matches alongside hash matches for bare terms', () => {
		expect(filterBySearch(tasks, 'a1b2c3').map(t => t.name)).toEqual(['Fix roof', 'Buy milk']);
	});

	it('returns an empty list when a hash matches nothing', () => {
		expect(filterBySearch(tasks, '#deadbe')).toEqual([]);
	});
});
