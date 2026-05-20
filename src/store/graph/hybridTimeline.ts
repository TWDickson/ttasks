import type { Task } from '../../types';
import { DAY_MS, addDays } from './graphTimeline';
import { normalizeTaskPath, resolveOwningProjectPath, dedupePaths } from './taskGraph';
import {
	resolveTaskDates,
	createWorkingCalendarResolver,
	addCalendarDays,
	inferParseDate,
	type ResolvedTaskDate,
	type ResolveTaskDatesOptions,
} from './taskGraphDates';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface HybridTimelineDefinedItem {
	path: string;
	task: Task;
	start: Date;
	end: Date;
	leftPercent: number;
	widthPercent: number;
	row: number;
	isInferred: boolean;
	groupKey: string;
	groupLabel: string;
}

export interface HybridTimelineUnderdefinedItem {
	path: string;
	task: Task;
	anchorPath: string;
	leftPercent: number;
	widthPercent: number;
	row: number;
	groupKey: string;
	groupLabel: string;
}

export interface HybridTimelineGroupBand {
	key: string;
	label: string;
	startRow: number;
	endRow: number;
	count: number;
}

export interface HybridTimelineLink {
	id: string;
	fromPath: string;
	toPath: string;
	fromPercent: number;
	toPercent: number;
	fromRow: number;
	toRow: number;
}

export interface HybridTimelineModel {
	rangeStart: Date;
	rangeEnd: Date;
	defined: HybridTimelineDefinedItem[];
	underdefined: HybridTimelineUnderdefinedItem[];
	links: HybridTimelineLink[];
	definedGroups: HybridTimelineGroupBand[];
	underdefinedGroups: HybridTimelineGroupBand[];
	definedRowCount: number;
	underdefinedRowCount: number;
}

export type HybridTimelineGrouping = 'none' | 'project' | 'dependency';

export interface BuildHybridTimelineOptions {
	grouping?: HybridTimelineGrouping;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

const OVERVIEW_MIN_PAST_DAYS = 14;
const OVERVIEW_MIN_FUTURE_DAYS = 28;

function resolveUnderdefinedWidthPercent(task: Task): number {
	const titleLength = task.name.trim().length;
	const width = 9 + Math.min(44, titleLength) * 0.23;
	return Math.min(20, Math.max(10, width));
}

function pathLeaf(path: string): string {
	const leaf = path.split('/').pop() ?? path;
	return leaf.replace(/\.md$/, '').replace(/^[a-f0-9]+-/, '');
}

function buildGroupBands(
	order: string[],
	labels: Map<string, string>,
	rowsByGroup: Map<string, number[]>,
): HybridTimelineGroupBand[] {
	const bands: HybridTimelineGroupBand[] = [];
	let cursor = 0;
	for (const key of order) {
		const rows = rowsByGroup.get(key) ?? [];
		const rowCount = Math.max(1, rows.length);
		bands.push({
			key,
			label: labels.get(key) ?? key,
			startRow: cursor,
			endRow: cursor + rowCount - 1,
			count: rowCount,
		});
		cursor += rowCount + 1;
	}
	if (bands.length > 0) {
		bands[bands.length - 1].endRow = Math.max(
			bands[bands.length - 1].startRow,
			bands[bands.length - 1].endRow,
		);
	}
	return bands;
}

function createTimelineGroupingResolver(
	mode: HybridTimelineGrouping,
	visibleTasks: Task[],
	allTasks: Task[],
): (task: Task) => { key: string; label: string } {
	if (mode === 'none') {
		return () => ({ key: '__all__', label: 'All tasks' });
	}

	if (mode === 'project') {
		const allTaskByPath = new Map(allTasks.map((task) => [task.path, task]));
		return (task) => {
			const owningProjectPath = resolveOwningProjectPath(task, allTaskByPath);
			if (!owningProjectPath) return { key: '__no_project__', label: 'No project' };
			const project = allTaskByPath.get(owningProjectPath);
			return {
				key: `project:${owningProjectPath}`,
				label: project?.name ?? pathLeaf(owningProjectPath),
			};
		};
	}

	const taskByPath = new Map(visibleTasks.map((task) => [task.path, task]));
	const neighbors = new Map<string, Set<string>>();
	for (const task of visibleTasks) neighbors.set(task.path, new Set<string>());
	for (const task of visibleTasks) {
		const deps = dedupePaths(
			(task.depends_on ?? [])
				.map((path) => normalizeTaskPath(path))
				.filter((path): path is string => !!path && taskByPath.has(path) && path !== task.path),
		);
		for (const dep of deps) {
			neighbors.get(task.path)?.add(dep);
			neighbors.get(dep)?.add(task.path);
		}
	}

	const componentByPath = new Map<string, string>();
	const labelByComponent = new Map<string, string>();
	let componentIndex = 0;
	for (const task of visibleTasks) {
		if (componentByPath.has(task.path)) continue;
		const stack = [task.path];
		const componentTasks: Task[] = [];
		while (stack.length > 0) {
			const current = stack.pop();
			if (!current || componentByPath.has(current)) continue;
			componentByPath.set(current, `dependency:${componentIndex}`);
			const currentTask = taskByPath.get(current);
			if (currentTask) componentTasks.push(currentTask);
			for (const next of neighbors.get(current) ?? []) {
				if (!componentByPath.has(next)) stack.push(next);
			}
		}
		componentTasks.sort((left, right) => left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
		labelByComponent.set(`dependency:${componentIndex}`, componentTasks[0]?.name ?? `Chain ${componentIndex + 1}`);
		componentIndex += 1;
	}

	return (task) => {
		const key = componentByPath.get(task.path) ?? 'dependency:unassigned';
		return { key, label: labelByComponent.get(key) ?? task.name };
	};
}

// ---------------------------------------------------------------------------
// Public: build hybrid Gantt timeline model
// ---------------------------------------------------------------------------

export function buildHybridTimeline(
	tasks: Task[],
	options: BuildHybridTimelineOptions = {},
): HybridTimelineModel {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const fallbackStart = addDays(today, -7);
	const fallbackEnd   = addDays(today, 21);
	const grouping = options.grouping ?? 'none';

	const visibleTasks = tasks.filter((task) => task.type === 'task');
	const taskByPath   = new Map(visibleTasks.map((task) => [task.path, task]));
	const resolved     = resolveTaskDates(visibleTasks, { allTasks: tasks });
	const resolveCalendar = createWorkingCalendarResolver(visibleTasks, { allTasks: tasks });
	const resolveGroup    = createTimelineGroupingResolver(grouping, visibleTasks, tasks);

	const resolvedEntries = [...resolved.entries()]
		.map(([path, dates]) => ({ path, task: taskByPath.get(path), dates }))
		.filter((entry): entry is { path: string; task: Task; dates: ResolvedTaskDate } => {
			if (!entry.task) return false;
			const hasExplicitDate = !!inferParseDate(entry.task.start_date) || !!inferParseDate(entry.task.due_date);
			const hasEstimate = typeof entry.task.estimated_days === 'number' && entry.task.estimated_days > 0;
			return hasExplicitDate || hasEstimate;
		})
		.sort((left, right) => left.dates.start.getTime() - right.dates.start.getTime() || left.task.name.localeCompare(right.task.name));

	const starts = resolvedEntries.map((entry) => entry.dates.start.getTime());
	const ends   = resolvedEntries.map((entry) => entry.dates.end.getTime());
	const baseRangeStart = starts.length > 0 ? new Date(Math.min(...starts)) : fallbackStart;
	const baseRangeEnd   = ends.length > 0   ? new Date(Math.max(...ends))   : fallbackEnd;
	const minRangeStart  = addDays(today, -OVERVIEW_MIN_PAST_DAYS);
	const minRangeEnd    = addDays(today,  OVERVIEW_MIN_FUTURE_DAYS);
	const rangeStart = baseRangeStart.getTime() <= minRangeStart.getTime() ? baseRangeStart : minRangeStart;
	const rangeEnd   = baseRangeEnd.getTime()   >= minRangeEnd.getTime()   ? baseRangeEnd   : minRangeEnd;
	const spanDays   = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS) + 1);

	const definedRowEndsByGroup = new Map<string, number[]>();
	const definedGroupOrder: string[] = [];
	const definedGroupLabels = new Map<string, string>();
	const defined: HybridTimelineDefinedItem[] = [];
	const definedByPath = new Map<string, HybridTimelineDefinedItem>();

	for (const entry of resolvedEntries) {
		const group = resolveGroup(entry.task);
		if (!definedRowEndsByGroup.has(group.key)) {
			definedRowEndsByGroup.set(group.key, []);
			definedGroupOrder.push(group.key);
			definedGroupLabels.set(group.key, group.label);
		}
		const groupRows = definedRowEndsByGroup.get(group.key) ?? [];

		const leftDays     = Math.max(0, Math.round((entry.dates.start.getTime() - rangeStart.getTime()) / DAY_MS));
		const durationDays = Math.max(1, Math.round((entry.dates.end.getTime() - entry.dates.start.getTime()) / DAY_MS) + 1);
		const leftPercent  = (leftDays / spanDays) * 100;
		const widthPercent = Math.max(2.4, (durationDays / spanDays) * 100);

		let localRow = 0;
		while (localRow < groupRows.length && leftDays <= groupRows[localRow]) localRow += 1;
		groupRows[localRow] = leftDays + durationDays;
		definedRowEndsByGroup.set(group.key, groupRows);

		const item: HybridTimelineDefinedItem = {
			path: entry.path,
			task: entry.task,
			start: entry.dates.start,
			end: entry.dates.end,
			leftPercent,
			widthPercent,
			row: localRow,
			isInferred: entry.dates.isInferred,
			groupKey: group.key,
			groupLabel: group.label,
		};
		defined.push(item);
		definedByPath.set(entry.path, item);
	}

	const definedGroupBands = buildGroupBands(definedGroupOrder, definedGroupLabels, definedRowEndsByGroup);
	for (const item of defined) {
		const band = definedGroupBands.find((candidate) => candidate.key === item.groupKey);
		item.row = (band?.startRow ?? 0) + item.row;
	}

	const underRowEndsByGroup = new Map<string, number[]>();
	const underGroupOrder: string[] = [];
	const underGroupLabels = new Map<string, string>();
	const underdefined: HybridTimelineUnderdefinedItem[] = [];
	const links: HybridTimelineLink[] = [];

	for (const task of visibleTasks) {
		if (definedByPath.has(task.path)) continue;
		if (inferParseDate(task.start_date) || inferParseDate(task.due_date)) continue;
		if (typeof task.estimated_days === 'number' && task.estimated_days > 0) continue;

		const deps = dedupePaths(
			(task.depends_on ?? [])
				.map((path) => normalizeTaskPath(path))
				.filter((path): path is string => !!path && taskByPath.has(path)),
		);

		let anchorPath: string | null = null;
		let anchorEndMs = Number.NEGATIVE_INFINITY;
		for (const depPath of deps) {
			const depDates = resolved.get(depPath);
			if (!depDates) continue;
			const depEndMs = depDates.end.getTime();
			if (depEndMs > anchorEndMs) { anchorEndMs = depEndMs; anchorPath = depPath; }
		}

		if (!anchorPath || !Number.isFinite(anchorEndMs)) continue;
		const anchorDate   = addCalendarDays(new Date(anchorEndMs), 1, resolveCalendar(task));
		const leftDays     = Math.max(0, Math.round((anchorDate.getTime() - rangeStart.getTime()) / DAY_MS));
		const leftPercent  = Math.min(98, (leftDays / spanDays) * 100);
		const widthPercent = resolveUnderdefinedWidthPercent(task);

		const group = resolveGroup(task);
		if (!underRowEndsByGroup.has(group.key)) {
			underRowEndsByGroup.set(group.key, []);
			underGroupOrder.push(group.key);
			underGroupLabels.set(group.key, group.label);
		}
		const groupRows = underRowEndsByGroup.get(group.key) ?? [];
		let localRow = 0;
		while (localRow < groupRows.length && leftPercent <= groupRows[localRow]) localRow += 1;
		groupRows[localRow] = leftPercent + widthPercent + 1.25;
		underRowEndsByGroup.set(group.key, groupRows);

		const item: HybridTimelineUnderdefinedItem = {
			path: task.path,
			task,
			anchorPath,
			leftPercent,
			widthPercent,
			row: localRow,
			groupKey: group.key,
			groupLabel: group.label,
		};
		underdefined.push(item);
	}

	const underGroupBands = buildGroupBands(underGroupOrder, underGroupLabels, underRowEndsByGroup);
	for (const item of underdefined) {
		const band = underGroupBands.find((candidate) => candidate.key === item.groupKey);
		item.row = (band?.startRow ?? 0) + item.row;

		const anchorResolved = definedByPath.get(item.anchorPath);
		if (anchorResolved) {
			const anchorEndDays    = Math.round((anchorResolved.end.getTime() - rangeStart.getTime()) / DAY_MS) + 1;
			const anchorEndPercent = Math.min(99, (Math.max(0, anchorEndDays) / spanDays) * 100);
			const fromPercent      = Math.min(anchorEndPercent, Math.max(0, item.leftPercent - 0.35));
			links.push({
				id: `${item.anchorPath}->${item.path}`,
				fromPath: item.anchorPath,
				toPath: item.path,
				fromPercent,
				toPercent: item.leftPercent,
				fromRow: anchorResolved.row,
				toRow: item.row,
			});
		}
	}

	underdefined.sort((left, right) => left.leftPercent - right.leftPercent || left.task.name.localeCompare(right.task.name));
	const definedRowCount     = Math.max(1, definedGroupBands.length > 0 ? definedGroupBands[definedGroupBands.length - 1].endRow + 1 : 0);
	const underdefinedRowCount = Math.max(1, underGroupBands.length > 0 ? underGroupBands[underGroupBands.length - 1].endRow + 1 : 0);

	return {
		rangeStart,
		rangeEnd,
		defined,
		underdefined,
		links,
		definedGroups: definedGroupBands,
		underdefinedGroups: underGroupBands,
		definedRowCount,
		underdefinedRowCount,
	};
}
