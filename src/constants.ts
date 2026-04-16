/**
 * Shared UI constants for TTasks.
 *
 * Single source of truth for values that were previously duplicated across
 * multiple components (CreateTaskModal, TaskDetail, HoldActionTaskRow,
 * TaskGraph, TaskKanban).
 */

import type { TaskPriority } from './types';

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
