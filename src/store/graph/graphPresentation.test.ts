import { describe, expect, it } from 'vitest';
import { computeDependencyLaneWidth, groupingLabel, laneHeaderClass } from './graphPresentation';

describe('graphPresentation', () => {
	it('returns compact and rotated classes for short lanes', () => {
		const classes = laneHeaderClass({ label: 'A', heightPx: 80 }, 132, 14);
		expect(classes).toContain('tt-dependency-lane-header');
		expect(classes).toContain('is-compact');
		expect(classes).toContain('is-rotated');
	});

	it('clamps dependency lane width between configured bounds', () => {
		const narrow = computeDependencyLaneWidth([{ label: 'A' }], 112, 148);
		const wide = computeDependencyLaneWidth([{ label: 'A very very very long lane label' }], 112, 148);
		expect(narrow).toBeGreaterThanOrEqual(112);
		expect(wide).toBeLessThanOrEqual(148);
	});

	it('maps grouping labels', () => {
		expect(groupingLabel('project')).toBe('Project');
		expect(groupingLabel('dependency')).toBe('Dependency');
		expect(groupingLabel('none')).toBe('None');
	});
});
