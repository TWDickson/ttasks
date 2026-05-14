import { describe, expect, it } from 'vitest';
import { buildLaneHeaders } from './graphLaneLayout';

// Constants matching TaskGraph.svelte
const ROW_H = 34;
const ROW_GAP = 8;
const PADDING = 8;

describe('buildLaneHeaders', () => {
	it('returns empty array for empty groups', () => {
		expect(buildLaneHeaders([], ROW_H, ROW_GAP, PADDING)).toEqual([]);
	});

	it('computes correct topPx for first group (startRow 0)', () => {
		const [header] = buildLaneHeaders(
			[{ key: 'a', label: 'Project A', startRow: 0, endRow: 0, count: 2 }],
			ROW_H, ROW_GAP, PADDING,
		);
		expect(header!.topPx).toBe(PADDING + 0 * (ROW_H + ROW_GAP)); // = 8
	});

	it('computes correct topPx for second group (startRow 3)', () => {
		const headers = buildLaneHeaders(
			[
				{ key: 'a', label: 'A', startRow: 0, endRow: 2, count: 3 },
				{ key: 'b', label: 'B', startRow: 3, endRow: 4, count: 2 },
			],
			ROW_H, ROW_GAP, PADDING,
		);
		expect(headers[1]!.topPx).toBe(PADDING + 3 * (ROW_H + ROW_GAP));
	});

	it('computes heightPx for single-row group', () => {
		const [header] = buildLaneHeaders(
			[{ key: 'a', label: 'A', startRow: 0, endRow: 0, count: 1 }],
			ROW_H, ROW_GAP, PADDING,
		);
		expect(header!.heightPx).toBe(ROW_H); // 1 row, 0 gaps
	});

	it('computes heightPx for three-row group', () => {
		const [header] = buildLaneHeaders(
			[{ key: 'a', label: 'A', startRow: 0, endRow: 2, count: 3 }],
			ROW_H, ROW_GAP, PADDING,
		);
		expect(header!.heightPx).toBe(3 * ROW_H + 2 * ROW_GAP);
	});

	it('passes through key and label correctly', () => {
		const [header] = buildLaneHeaders(
			[{ key: 'proj-x', label: 'Project X', startRow: 0, endRow: 0, count: 5 }],
			ROW_H, ROW_GAP, PADDING,
		);
		expect(header!.key).toBe('proj-x');
		expect(header!.label).toBe('Project X');
	});

	it('passes through taskCount', () => {
		const [header] = buildLaneHeaders(
			[{ key: 'a', label: 'A', startRow: 0, endRow: 1, count: 7 }],
			ROW_H, ROW_GAP, PADDING,
		);
		expect(header!.taskCount).toBe(7);
	});

	it('defaults taskCount to 0 when count is missing', () => {
		const [header] = buildLaneHeaders(
			[{ key: 'a', label: 'A', startRow: 0, endRow: 0 }],
			ROW_H, ROW_GAP, PADDING,
		);
		expect(header!.taskCount).toBe(0);
	});
});
