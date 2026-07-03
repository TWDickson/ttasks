/* Maps raw vault files (served by vault-data-plugin) to Task objects using the
   same rules as TaskStore.fileToTask, with a basename-based wiki-link resolver
   standing in for Obsidian's metadataCache. */

import type { Task, TaskPriority, TaskRecordType } from '../src/types';
import { parseWikiLink } from '../src/utils/wikiLink';
import { ensureMdExt } from '../src/utils/pathUtils';

export interface RawTaskFile {
	path: string;
	basename: string;
	frontmatter: Record<string, unknown>;
	notes: string;
}

export interface VaultPayload {
	settings: Record<string, unknown> | null;
	files: RawTaskFile[];
}

export async function fetchVaultPayload(): Promise<VaultPayload | null> {
	try {
		const res = await fetch('/__vault.json');
		if (!res.ok) return null;
		const payload = (await res.json()) as VaultPayload;
		return payload.files?.length ? payload : null;
	} catch {
		return null;
	}
}

export function mapVaultTasks(payload: VaultPayload): Task[] {
	const byBasename = new Map<string, string>();
	for (const file of payload.files) {
		byBasename.set(file.basename, file.path);
	}

	const resolveLink = (raw: unknown): string | null => {
		const linkpath = parseWikiLink(raw);
		if (!linkpath) return null;
		const leaf = linkpath.split('/').pop() ?? linkpath;
		return byBasename.get(leaf.replace(/\.md$/, '')) ?? ensureMdExt(linkpath);
	};

	const resolveLinks = (raw: unknown): string[] => {
		if (!Array.isArray(raw)) return [];
		return raw.map(resolveLink).filter((p): p is string => !!p);
	};

	const settings = payload.settings ?? {};
	const statuses = (settings.statuses as string[]) ?? ['Active'];
	const completionStatus = (settings.completionStatus as string) ?? statuses[statuses.length - 1] ?? 'Done';

	return payload.files.map((file) => {
		const fm = file.frontmatter;
		const dashIdx = file.basename.indexOf('-');
		const rawStatus = typeof fm.status === 'string' ? fm.status : '';
		const status = rawStatus && statuses.includes(rawStatus) ? rawStatus : (statuses[0] ?? 'Active');
		const area = typeof fm.area === 'string' ? fm.area : null;
		const asDate = (v: unknown): string | null => {
			if (typeof v === 'string' && v) return v.slice(0, 10);
			if (v instanceof Date || (v && typeof v === 'object' && 'toISOString' in (v as object))) {
				return (v as Date).toISOString().slice(0, 10);
			}
			return null;
		};

		return {
			id: dashIdx >= 0 ? file.basename.slice(0, dashIdx) : file.basename,
			slug: dashIdx >= 0 ? file.basename.slice(dashIdx + 1) : '',
			path: file.path,
			type: (fm.type as TaskRecordType) ?? 'task',
			name: (fm.name as string) ?? file.basename,
			area,
			status,
			priority: (fm.priority as TaskPriority) ?? 'None',
			labels: Array.isArray(fm.labels) ? fm.labels.filter((v): v is string => typeof v === 'string') : [],
			parent_task: resolveLink(fm.parent_task),
			depends_on: resolveLinks(fm.depends_on),
			blocks: resolveLinks(fm.blocks),
			blocked_reason: (fm.blocked_reason as string) ?? '',
			assigned_to: (fm.assigned_to as string) ?? '',
			source: (fm.source as string) ?? '',
			start_date: asDate(fm.start_date),
			due_date: asDate(fm.due_date),
			due_time: typeof fm.due_time === 'string' ? fm.due_time : null,
			estimated_days: typeof fm.estimated_days === 'number' ? fm.estimated_days : null,
			workweek_only: fm.workweek_only === true,
			holiday_dates: Array.isArray(fm.holiday_dates)
				? fm.holiday_dates.map(asDate).filter((v): v is string => !!v)
				: [],
			created: asDate(fm.created),
			completed: asDate(fm.completed),
			status_changed: asDate(fm.status_changed),
			recurrence: typeof fm.recurrence === 'string' ? fm.recurrence : null,
			recurrence_type: typeof fm.recurrence_type === 'string' ? fm.recurrence_type : null,
			notes: file.notes,
			reminder_override: fm.reminder_override === 'urgent' || fm.reminder_override === 'mute'
				? fm.reminder_override : null,
			is_complete: status === completionStatus,
			is_inbox: area === null,
		};
	});
}
