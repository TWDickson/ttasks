import { describe, expect, it } from 'vitest';
import { moveBoardFocus } from './boardFocus';

describe('moveBoardFocus', () => {
	it('returns null for empty path list', () => {
		expect(moveBoardFocus([], null, 'next')).toBeNull();
		expect(moveBoardFocus([], 'Tasks/a.md', 'prev')).toBeNull();
	});

	it('moves to first path when current is null and direction is next', () => {
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md'], null, 'next')).toBe('Tasks/a.md');
	});

	it('moves to last path when current is null and direction is prev', () => {
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md'], null, 'prev')).toBe('Tasks/b.md');
	});

	it('moves to first path when current is not in list and direction is next', () => {
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md'], 'Tasks/missing.md', 'next')).toBe('Tasks/a.md');
	});

	it('moves to last path when current is not in list and direction is prev', () => {
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md'], 'Tasks/missing.md', 'prev')).toBe('Tasks/b.md');
	});

	it('moves forward through the list', () => {
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md'], 'Tasks/a.md', 'next')).toBe('Tasks/b.md');
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md'], 'Tasks/b.md', 'next')).toBe('Tasks/c.md');
	});

	it('moves backward through the list', () => {
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md'], 'Tasks/c.md', 'prev')).toBe('Tasks/b.md');
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md', 'Tasks/c.md'], 'Tasks/b.md', 'prev')).toBe('Tasks/a.md');
	});

	it('clamps at the end when moving next from last', () => {
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md'], 'Tasks/b.md', 'next')).toBe('Tasks/b.md');
	});

	it('clamps at the start when moving prev from first', () => {
		expect(moveBoardFocus(['Tasks/a.md', 'Tasks/b.md'], 'Tasks/a.md', 'prev')).toBe('Tasks/a.md');
	});
});
