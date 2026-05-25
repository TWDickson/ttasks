import { describe, expect, it } from 'vitest';
import { mutateLinkArray } from './arrayUtils';

describe('mutateLinkArray', () => {
	it('adds to an empty array', () => {
		expect(mutateLinkArray([], ['A'], [])).toEqual(['A']);
	});

	it('removes an existing path', () => {
		expect(mutateLinkArray(['A', 'B'], [], ['A'])).toEqual(['B']);
	});

	it('ignores removes for missing paths', () => {
		expect(mutateLinkArray(['A', 'B'], [], ['Z'])).toEqual(['A', 'B']);
	});

	it('deduplicates existing and added values', () => {
		expect(mutateLinkArray(['A', 'A'], ['A', 'B', 'B'], [])).toEqual(['A', 'B']);
	});

	it('lets remove win when value is both added and removed', () => {
		expect(mutateLinkArray(['A', 'B'], ['A', 'C'], ['A'])).toEqual(['B', 'C']);
	});

	it('returns a copy when add/remove are empty', () => {
		const current = ['A', 'B'];
		const result = mutateLinkArray(current, [], []);
		expect(result).toEqual(['A', 'B']);
		expect(result).not.toBe(current);
	});

	it('preserves order of unaffected values', () => {
		expect(mutateLinkArray(['A', 'B', 'C'], ['D'], ['B'])).toEqual(['A', 'C', 'D']);
	});

	it('does not mutate input arrays', () => {
		const current = ['A'];
		const add = ['B'];
		const remove = ['C'];
		void mutateLinkArray(current, add, remove);
		expect(current).toEqual(['A']);
		expect(add).toEqual(['B']);
		expect(remove).toEqual(['C']);
	});
});