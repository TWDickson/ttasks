import { describe, expect, it } from 'vitest';
import { parseDatesFromFilename } from './filenameDateParser';

describe('parseDatesFromFilename', () => {
	it('extracts a leading filename date as the start date', () => {
		expect(parseDatesFromFilename('2026-05-22 Meeting with Bob')).toEqual({
			startDate: '2026-05-22',
			dueDate: null,
		});
	});

	it('extracts a trailing filename date as the start date', () => {
		expect(parseDatesFromFilename('Meeting with Bob 2026-05-22')).toEqual({
			startDate: '2026-05-22',
			dueDate: null,
		});
	});

	it('uses the first two dates in a range-like filename', () => {
		expect(parseDatesFromFilename('2026-05-22 to 2026-05-24 Sprint')).toEqual({
			startDate: '2026-05-22',
			dueDate: '2026-05-24',
		});
	});

	it('parses plain daily-note style filenames', () => {
		expect(parseDatesFromFilename('2026-05-22')).toEqual({
			startDate: '2026-05-22',
			dueDate: null,
		});
	});

	it('returns nulls when there is no date in the filename', () => {
		expect(parseDatesFromFilename('Meeting with Bob')).toEqual({
			startDate: null,
			dueDate: null,
		});
	});

	it('ignores dates after the first two matches', () => {
		expect(parseDatesFromFilename('2026-05-22 to 2026-05-24 to 2026-05-26')).toEqual({
			startDate: '2026-05-22',
			dueDate: '2026-05-24',
		});
	});

	it('does not match invalid month or day values', () => {
		expect(parseDatesFromFilename('2026-13-99 Meeting')).toEqual({
			startDate: null,
			dueDate: null,
		});
	});

	it('extracts embedded dates found mid-word', () => {
		expect(parseDatesFromFilename('note2026-05-22end')).toEqual({
			startDate: '2026-05-22',
			dueDate: null,
		});
	});

	it('handles empty filenames', () => {
		expect(parseDatesFromFilename('')).toEqual({
			startDate: null,
			dueDate: null,
		});
	});

	it('ignores non-iso weekly note formats', () => {
		expect(parseDatesFromFilename('2026-W21')).toEqual({
			startDate: null,
			dueDate: null,
		});
	});
});