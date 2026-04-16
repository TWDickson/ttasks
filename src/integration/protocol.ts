import type { QuickActionId } from '../settings';
import { ensureMdExt } from '../utils/pathUtils';

export type ProtocolActionName =
	| 'open-board'
	| 'open'
	| 'new-task'
	| 'new-project'
	| 'quick';

export interface ParsedProtocolAction {
	action: ProtocolActionName;
	path?: string;
	quickAction?: Exclude<QuickActionId, 'none'>;
}

export interface ProtocolDispatchDeps {
	openBoard: () => Promise<void>;
	openTask: (path: string) => Promise<void>;
	createTask: () => Promise<void>;
	createProject: () => Promise<void>;
	runQuickAction: (action: Exclude<QuickActionId, 'none'>, path?: string) => Promise<boolean>;
	notice: (message: string) => void;
}

function firstString(value: unknown): string | undefined {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	}
	if (Array.isArray(value)) {
		for (const entry of value) {
			if (typeof entry === 'string' && entry.trim().length > 0) {
				return entry.trim();
			}
		}
	}
	return undefined;
}

function normalizeQuickAction(value: string | undefined): Exclude<QuickActionId, 'none'> | undefined {
	if (!value) return undefined;
	if (value === 'start' || value === 'complete' || value === 'block' || value === 'defer') {
		return value;
	}
	return undefined;
}

export function parseProtocolAction(params: Record<string, unknown>): ParsedProtocolAction {
	const rawAction = firstString(params.action) ?? 'open-board';
	const rawPath = firstString(params.path);
	const normalizedPath = rawPath ? ensureMdExt(rawPath) : undefined;

	if (rawAction === 'open-board') {
		return { action: 'open-board' };
	}
	if (rawAction === 'open') {
		return { action: 'open', path: normalizedPath };
	}
	if (rawAction === 'new-task') {
		return { action: 'new-task' };
	}
	if (rawAction === 'new-project') {
		return { action: 'new-project' };
	}

	if (rawAction === 'quick') {
		const quickAction = normalizeQuickAction(firstString(params.quickAction));
		if (!quickAction) return { action: 'open-board' };
		return { action: 'quick', quickAction, path: normalizedPath };
	}

	const prefixedQuick = rawAction.match(/^quick-(start|complete|block|defer)$/);
	if (prefixedQuick?.[1]) {
		const quickAction = normalizeQuickAction(prefixedQuick[1]);
		if (!quickAction) return { action: 'open-board' };
		return { action: 'quick', quickAction, path: normalizedPath };
	}

	return { action: 'open-board' };
}

export async function dispatchProtocolAction(action: ParsedProtocolAction, deps: ProtocolDispatchDeps): Promise<void> {
	if (action.action === 'open-board') {
		await deps.openBoard();
		return;
	}

	if (action.action === 'open') {
		if (!action.path) {
			deps.notice('TTasks: missing required path.');
			return;
		}
		await deps.openTask(action.path);
		return;
	}

	if (action.action === 'new-task') {
		await deps.createTask();
		return;
	}

	if (action.action === 'new-project') {
		await deps.createProject();
		return;
	}

	if (!action.path) {
		deps.notice('TTasks: missing required path.');
		return;
	}
	if (!action.quickAction) {
		deps.notice('TTasks: invalid quick action.');
		return;
	}

	await deps.runQuickAction(action.quickAction, action.path);
}
