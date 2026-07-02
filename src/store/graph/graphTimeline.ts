import type { Task } from '../../types';

export const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_FUTURE_DAYS = 28;
const MIN_PAST_DAYS = 14;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function addDays(date: Date, days: number): Date {
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
	// Local components, not toISOString(): dates here are local midnights, and
	// UTC conversion shifts them to the previous day in UTC+ timezones.
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatMonthDay(date: Date): string {
	return `${MONTH_LABELS[date.getMonth()]} ${date.getDate()}`;
}

function parseIsoDate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const parsed = new Date(`${value}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return null;
	parsed.setHours(0, 0, 0, 0);
	return parsed;
}

export function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6;
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

export function buildTimelineNonWorkingBands(start: Date, end: Date, holidayDates: Set<string>): TimelineNonWorkingBand[] {
	const span = Math.max(1, diffDays(start, end) + 1);
	const widthPercent = 100 / span;
	const bands: TimelineNonWorkingBand[] = [];

	for (let offset = 0; offset <= span - 1; offset += 1) {
		const date = addDays(start, offset);
		const isoDate = formatDateISO(date);
		const holiday = holidayDates.has(isoDate);
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
