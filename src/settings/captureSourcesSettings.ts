import type { App } from 'obsidian';
import {
	DEFAULT_CAPTURE_SOURCE_CONFIG,
	normalizeCaptureSource,
	normalizeCaptureSourceDefaults,
} from './defaults';
import type { CaptureSourceConfig } from './types';

type DailyNotesInterface = {
	getDailyNoteSettings: () => { folder?: string };
	getWeeklyNoteSettings: () => { folder?: string };
	getMonthlyNoteSettings: () => { folder?: string };
	getQuarterlyNoteSettings: () => { folder?: string };
	getYearlyNoteSettings: () => { folder?: string };
};

function loadDailyNotesInterface(): DailyNotesInterface | null {
	try {
		// The interface package depends on Obsidian runtime globals, so load it lazily.
		return require('obsidian-daily-notes-interface') as DailyNotesInterface;
	} catch {
		return null;
	}
}

const ROLLOVER_PLUGIN_IDS = [
	'obsidian-rollover-daily-todos',
];

function normalizeSourcePath(path: string): string {
	return path.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
}

export function mergeAutoDetectedSources(
	existing: CaptureSourceConfig[],
	detected: CaptureSourceConfig[],
): CaptureSourceConfig[] {
	const merged = [...existing];
	const seen = new Set(existing.map((source) => normalizeSourcePath(source.path)).filter(Boolean));

	for (const source of detected) {
		const normalized = normalizeSourcePath(source.path);
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		merged.push({
			...source,
			path: normalized,
			defaults: normalizeCaptureSourceDefaults(source.defaults),
		});
		seen.add(normalized);
	}

	return merged;
}

export function detectRolloverPlugin(app: App): boolean {
	const plugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins ?? {};
	return ROLLOVER_PLUGIN_IDS.some((pluginId) => !!plugins[pluginId]);
}

export function buildAutoDetectedSources(
	_app: App,
	loadInterface: () => DailyNotesInterface | null = loadDailyNotesInterface,
): CaptureSourceConfig[] {
	const dailyNotes = loadInterface();
	if (!dailyNotes) {
		return [];
	}

	const detectedFolders = [
		dailyNotes.getDailyNoteSettings()?.folder,
		dailyNotes.getWeeklyNoteSettings()?.folder,
		dailyNotes.getMonthlyNoteSettings()?.folder,
		dailyNotes.getQuarterlyNoteSettings()?.folder,
		dailyNotes.getYearlyNoteSettings()?.folder,
	];

	const seen = new Set<string>();
	const sources: CaptureSourceConfig[] = [];

	for (const folder of detectedFolders) {
		const normalized = normalizeSourcePath(folder ?? '');
		if (!normalized || seen.has(normalized)) {
			continue;
		}

		sources.push(normalizeCaptureSource({
			path: normalized,
			...DEFAULT_CAPTURE_SOURCE_CONFIG,
		}));
		seen.add(normalized);
	}

	return sources;
}