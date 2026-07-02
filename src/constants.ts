/**
 * Shared constants for TTasks.
 *
 * Keep cross-cutting timing, renderer, and UI limits in one place so behavior
 * changes have a single source of truth.
 */

import type { TaskPriority } from './types';
import type { TaskViewRenderer } from './settings/types';

/**
 * The canonical priority list, in display / sort order (highest first).
 * Single source of truth for the filter bar, engine ordering, schema options,
 * and detail-panel options. `satisfies` keeps it in lockstep with TaskPriority.
 */
export const PRIORITIES = ['High', 'Medium', 'Low', 'None'] as const satisfies readonly TaskPriority[];

/**
 * Maps each TaskPriority to an Obsidian CSS variable string.
 * Import this in any component that needs to colour-code by priority.
 */
export const PRIORITY_COLORS: Record<TaskPriority, string> = {
	High:   'var(--color-red)',
	Medium: 'var(--color-orange)',
	Low:    'var(--color-blue)',
	None:   'var(--text-faint)',
};

export const REMINDER_POLL_INTERVAL_MS = 5 * 60 * 1_000;
export const NOTICE_DURATION_MS = 8_000;
export const AUTO_ARCHIVE_CHECK_INTERVAL_MS = 60 * 60 * 1_000;
export const VAULT_MODIFY_DEBOUNCE_MS = 300;
export const METADATA_CACHE_TIMEOUT_MS = 10_000;

export const MAX_REL_TREE_DEPTH = 5;
export const MAX_REL_TREE_NODES = 60;

export const RENDERER_LIST = 'list' as const;
export const RENDERER_KANBAN = 'kanban' as const;
export const RENDERER_AGENDA = 'agenda' as const;
export const RENDERER_GRAPH = 'graph' as const;
export const RENDERER_ARCHIVE = 'archive' as const;

export type RendererType = TaskViewRenderer;

export const REMINDER_SNOOZE_HOURS = 4;
export const REMINDER_LEAD_DAYS = 7;
export const REMINDER_STALE_DAYS = 14;

export const ARCHIVE_HISTORY_MAX_ENTRIES = 50;
export const DEFAULT_ARCHIVE_DAYS_AFTER_COMPLETE = 45;
