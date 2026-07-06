import type { Task } from '../../types';
import { MONTH_ABBR } from '../../utils/dateUtils';

// Canonical Date-object date helpers live in utils/dateUtils. They are
// re-exported here so the many graph modules importing from graphTimeline keep
// working without churn.
export { DAY_MS, addDays, startOfToday, diffDays, formatDateISO, isWeekend, parseIsoDate } from '../../utils/dateUtils';
import { addDays, diffDays, formatDateISO, isWeekend, parseIsoDate, startOfToday } from '../../utils/dateUtils';

const MIN_FUTURE_DAYS = 28;
const MIN_PAST_DAYS = 14;

function formatMonthDay(date: Date): string {
	return `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}`;
}

export function normalizeTimelineRange(start: Date, end: Date, today: Date = startOfToday()): { start: Date; end: Date } {
	const normalizedToday = new Date(today.getTime());
	normalizedToday.setHours(0, 0, 0, 0);
	const minStart = addDays(normalizedToday, -MIN_PAST_DAYS);
	const minEnd = addDays(normalizedToday, MIN_FUTURE_DAYS);
	const normalizedStart = start.getTime() > minStart.getTime() ? minStart : start;
	const normalizedEnd = end.getTime() < minEnd.getTime() ? minEnd : end;
	return {
		start: normalizedStart,
		end: normalizedEnd,
	};
}

export function collectProjectHolidayDates(tasks: Task[]): Set<string> {
	const dates = new Set<string>();
	for (const task of tasks) {
		if (task.type !== 'project' || !Array.isArray(task.holiday_dates)) continue;
		for (const value of task.holiday_dates) {
			if (typeof value !== 'string') continue;
			if (!parseIsoDate(value)) continue;
			dates.add(value);
		}
	}
	return dates;
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

export interface TimelineTick {
	date: Date;
	label: string;
	leftPercent: number;
	position: 'start' | 'middle' | 'end';
}

export interface TimelineNonWorkingBand {
	id: string;
	date: string;
	leftPercent: number;
	widthPercent: number;
	kind: 'weekend' | 'holiday';
	label: string;
}

export function buildTimelineTicks(start: Date, end: Date): TimelineTick[] {
	const span = Math.max(1, diffDays(start, end) + 1);
	const stepDays = span > 180 ? 30 : span > 90 ? 14 : 7;
	const ticks: TimelineTick[] = [];
	for (let offset = 0; offset <= span - 1; offset += stepDays) {
		const tickDate = addDays(start, offset);
		ticks.push({
			date: tickDate,
			label: formatMonthDay(tickDate),
			leftPercent: (offset / span) * 100,
			position: offset === 0 ? 'start' : 'middle',
		});
	}
	const endTick: TimelineTick = {
			date: end,
			label: formatMonthDay(end),
			leftPercent: 100,
			position: 'end',
		};
	if (ticks.length === 0) {
		ticks.push(endTick);
	} else if (ticks[ticks.length - 1].leftPercent >= 96) {
		ticks[ticks.length - 1] = endTick;
	} else {
		ticks.push(endTick);
	}
	ticks[0].position = 'start';
	ticks[ticks.length - 1].position = 'end';
	return ticks;
}

export function buildTimelineNonWorkingBands(
	start: Date,
	end: Date,
	holidayDates: Set<string>,
	recurringHolidays: Set<string> = new Set<string>(),
): TimelineNonWorkingBand[] {
	const span = Math.max(1, diffDays(start, end) + 1);
	const widthPercent = 100 / span;
	const bands: TimelineNonWorkingBand[] = [];

	for (let offset = 0; offset <= span - 1; offset += 1) {
		const date = addDays(start, offset);
		const isoDate = formatDateISO(date);
		const holiday = holidayDates.has(isoDate) || recurringHolidays.has(isoDate.slice(5));
		if (!holiday && !isWeekend(date)) continue;

		bands.push({
			id: `${isoDate}:${holiday ? 'holiday' : 'weekend'}`,
			date: isoDate,
			leftPercent: (offset / span) * 100,
			widthPercent,
			kind: holiday ? 'holiday' : 'weekend',
			label: holiday ? `${isoDate} (holiday)` : `${isoDate} (weekend)`,
		});
	}

	return bands;
}
