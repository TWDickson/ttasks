import { parseCheckboxLine, isTTasksLink } from './checkboxParser';
import { parseEmojiFields } from './emojiFieldParser';
import { parseDatesFromFilename } from './filenameDateParser';
import type { ExternalTask } from './types';
import type { CaptureSourceConfig } from '../settings/types';

function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function fileBasenameWithoutExtension(filePath: string): string {
	const normalized = normalizePath(filePath);
	const basename = normalized.split('/').pop() ?? normalized;
	return basename.replace(/\.md$/i, '');
}

function resolveSectionFilterState(
	line: string,
	sectionFilter: string,
	active: boolean,
): boolean {
	if (!sectionFilter) {
		return true;
	}

	const heading = line.match(/^#{1,6}\s+(.*)$/);
	if (!heading) {
		return active;
	}

	return heading[1].trim().toLowerCase() === sectionFilter.trim().toLowerCase();
}

export function isInCaptureScope(filePath: string, config: CaptureSourceConfig): boolean {
	const normalizedFilePath = normalizePath(filePath);
	const sourcePath = normalizePath(config.path);

	if (!sourcePath) return false;
	if (normalizedFilePath === sourcePath) return true;

	const sourceWithSlash = `${sourcePath}/`;
	if (!normalizedFilePath.startsWith(sourceWithSlash)) {
		return false;
	}

	if (config.includeSubdirectories) {
		return true;
	}

	const relative = normalizedFilePath.slice(sourceWithSlash.length);
	return !relative.includes('/');
}

export function scanFileForCapturableTasks(
	content: string,
	filePath: string,
	config: CaptureSourceConfig,
	tasksFolder: string,
): ExternalTask[] {
	const results: ExternalTask[] = [];
	const lines = content.split(/\r?\n/);
	const filenameDates = config.inheritDateFromFilename
		? parseDatesFromFilename(fileBasenameWithoutExtension(filePath))
		: { startDate: null, dueDate: null };

	let inTargetSection = config.sectionFilter.trim() === '';

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		inTargetSection = resolveSectionFilterState(line, config.sectionFilter, inTargetSection);
		if (!inTargetSection) {
			continue;
		}

		const parsed = parseCheckboxLine(line);
		if (!parsed) {
			continue;
		}

		if (parsed.checked || parsed.cancelled) {
			continue;
		}

		if (parsed.hasTTasksLink || isTTasksLink(parsed.text, tasksFolder)) {
			continue;
		}

		const emoji = parseEmojiFields(parsed.text);
		// area always comes from capture source config; emoji fields do not override it
		const area = config.defaults.area;
		const labels = config.defaults.labels ?? [];
		const status = config.defaults.status ?? 'Active';
		const priority = emoji.priority !== 'None'
			? emoji.priority
			: (config.defaults.priority ?? 'None');
		const startDate = emoji.startDate ?? filenameDates.startDate;
		const dueDate = emoji.dueDate ?? filenameDates.dueDate;
		const createdDate = emoji.createdDate ?? null;

		results.push({
			id: `ext-${index + 1}`,
			slug: `${index + 1}`,
			path: `${normalizePath(filePath)}#L${index + 1}`,
			type: 'task',
			name: emoji.description || parsed.text,
			area,
			status,
			priority,
			labels,
			parent_task: null,
			depends_on: [],
			blocks: [],
			blocked_reason: '',
			assigned_to: config.defaults.assignedTo ?? '',
			source: normalizePath(filePath),
			start_date: startDate,
			due_date: dueDate,
			due_time: null,
			estimated_days: null,
			created: createdDate,
			completed: emoji.completedDate,
			status_changed: null,
			recurrence: emoji.recurrence,
			recurrence_type: null,
			notes: '',
			is_complete: false,
			is_inbox: area === null,
			external: true,
			source_type: 'captured-checkbox',
			location: {
				filePath: normalizePath(filePath),
				line: index + 1,
			},
			fromPreviousDay: false,
		});
	}

	return results;
}
