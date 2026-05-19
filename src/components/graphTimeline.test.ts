import { describe, expect, it } from 'vitest';
import { buildTimelineTicks, diffDays, formatDateISO, intersectsViewport, percentAtDate } from './graphTimeline';

describe('graphTimeline', () => {
	it('diffDays returns whole-day delta', () => {
		expect(diffDays(new Date('2026-05-01'), new Date('2026-05-03'))).toBe(2);
	});

	it('formatDateISO returns YYYY-MM-DD', () => {
		expect(formatDateISO(new Date('2026-05-19T12:30:45Z'))).toBe('2026-05-19');
	});

	it('percentAtDate clamps to [0,100]', () => {
		const start = new Date('2026-05-01');
		const end = new Date('2026-05-11');
		expect(percentAtDate(new Date('2026-04-20'), start, end)).toBe(0);
		expect(percentAtDate(new Date('2026-05-20'), start, end)).toBe(100);
	});

	it('intersectsViewport detects overlap correctly', () => {
		expect(intersectsViewport(20, 10, 0, 25)).toBe(true);
		expect(intersectsViewport(40, 10, 0, 25)).toBe(false);
	});

	it('buildTimelineTicks includes end tick at 100%', () => {
		const ticks = buildTimelineTicks(new Date('2026-05-01'), new Date('2026-05-10'));
		expect(ticks.length).toBeGreaterThan(0);
		expect(ticks[ticks.length - 1].leftPercent).toBe(100);
		expect(ticks[ticks.length - 1].label).toBe('2026-05-10');
	});
});
