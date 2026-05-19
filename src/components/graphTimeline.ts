const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(date: Date, days: number): Date {
	const next = new Date(date.getTime());
	next.setDate(next.getDate() + days);
	return next;
}

export function startOfToday(): Date {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return today;
}

export function diffDays(start: Date, end: Date): number {
	return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function formatDateISO(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function percentAtDate(date: Date, rangeStart: Date, rangeEnd: Date): number {
	const spanDays = Math.max(1, diffDays(rangeStart, rangeEnd) + 1);
	const offsetDays = diffDays(rangeStart, date);
	return Math.max(0, Math.min(100, (offsetDays / spanDays) * 100));
}

export function intersectsViewport(left: number, width: number, min: number, max: number): boolean {
	const right = left + width;
	return right >= min && left <= max;
}

export function buildTimelineTicks(start: Date, end: Date): Array<{ date: Date; label: string; leftPercent: number }> {
	const span = Math.max(1, diffDays(start, end) + 1);
	const stepDays = span > 180 ? 30 : span > 90 ? 14 : 7;
	const ticks: Array<{ date: Date; label: string; leftPercent: number }> = [];
	for (let offset = 0; offset <= span - 1; offset += stepDays) {
		const tickDate = addDays(start, offset);
		ticks.push({
			date: tickDate,
			label: formatDateISO(tickDate),
			leftPercent: (offset / span) * 100,
		});
	}
	if (ticks.length === 0 || ticks[ticks.length - 1].leftPercent < 99.5) {
		ticks.push({
			date: end,
			label: formatDateISO(end),
			leftPercent: 100,
		});
	}
	return ticks;
}
