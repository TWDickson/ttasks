// Pure presentation logic for the desktop status-bar Pomodoro countdown. NO
// Obsidian imports — enforced by architectureBoundaries.test.ts. main.ts owns
// the status-bar element, the timer icon, and the click handler; this only maps
// a session to the text + tooltip + styling flags so it stays unit-testable.

import { type PomodoroSession, formatRemaining } from './pomodoro';

export interface PomodoroStatusBarView {
	/** Short label shown in the status bar next to the timer icon, e.g. "12:34". */
	text: string;
	/** Hover tooltip: phase, remaining, task, and the click hint. */
	tooltip: string;
	/** Current phase — drives the break/paused styling class. */
	mode: PomodoroSession['mode'];
	/** false while paused (dims the readout). */
	running: boolean;
}

const MODE_LABEL: Record<PomodoroSession['mode'], string> = {
	focus: 'Focus',
	'short-break': 'Short break',
	'long-break': 'Long break',
};

/**
 * Map a live session to what the status bar should show, or null when idle (the
 * caller hides the item). A paused session still renders — dimmed — so the user
 * can see it's parked, not gone.
 */
export function pomodoroStatusBarView(session: PomodoroSession | null): PomodoroStatusBarView | null {
	if (!session) return null;

	const text = formatRemaining(session);
	const label = MODE_LABEL[session.mode];
	const fillPart = session.isFill ? ' · final' : '';
	const taskPart = session.taskName ? ` · ${session.taskName}` : '';
	const statePart = session.running ? '' : ' · paused';
	const hint = session.running ? 'Click to pause' : 'Click to resume';
	const tooltip = `${label}${fillPart} — ${text} left${taskPart}${statePart}\n${hint}`;

	return { text, tooltip, mode: session.mode, running: session.running };
}
