import type { PomodoroMode, PomodoroSession } from '../integration/pomodoro';

/**
 * The detail pane's Pomodoro control (AR-8): the session shows as a live timer
 * only on the task that owns it; on any other task the control offers "start".
 */
export function sessionForTask(session: PomodoroSession | null, taskPath: string | null): PomodoroSession | null {
	return session && taskPath && session.taskPath === taskPath ? session : null;
}

const PHASE_LABELS: Record<PomodoroMode, string> = {
	'focus': 'Focus',
	'short-break': 'Short break',
	'long-break': 'Long break',
};

export function pomodoroPhaseLabel(session: PomodoroSession | null): string {
	return session ? PHASE_LABELS[session.mode] : '';
}
