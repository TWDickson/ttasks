// The Pomodoro alert-sound catalogue: ids, labels, the settings guard, and each
// preset's note table. Data only — playback lives in pomodoroAlert.ts, so the
// settings layer can validate a sound id without importing Web Audio code (AR-7).
// NO Obsidian imports — enforced by architectureBoundaries.test.ts.

export const POMODORO_ALERT_SOUNDS = ['chime', 'bell', 'marimba', 'beep', 'alarm'] as const;
export type PomodoroAlertSound = (typeof POMODORO_ALERT_SOUNDS)[number];

export const POMODORO_ALERT_SOUND_LABELS: Record<PomodoroAlertSound, string> = {
	chime: 'Chime — two soft notes',
	bell: 'Bell — long ring',
	marimba: 'Marimba — rising arpeggio',
	beep: 'Beep — three short beeps',
	alarm: 'Alarm — insistent, hard to miss',
};

export function isPomodoroAlertSound(value: unknown): value is PomodoroAlertSound {
	return (POMODORO_ALERT_SOUNDS as readonly string[]).includes(value as string);
}

/** One synthesized note: frequency (Hz), start offset (s), length (s), waveform, relative level. */
export type Note = [freq: number, at: number, dur: number, wave: OscillatorType, level: number];

export const SOUNDS: Record<PomodoroAlertSound, Note[]> = {
	chime: [[659.25, 0, 0.42, 'sine', 1], [880, 0.18, 0.42, 'sine', 1]],
	bell: [[1046.5, 0, 1.4, 'triangle', 1], [2093, 0, 1.0, 'sine', 0.4], [1046.5, 0.5, 1.2, 'triangle', 0.7]],
	marimba: [[523.25, 0, 0.3, 'triangle', 1], [659.25, 0.12, 0.3, 'triangle', 1], [783.99, 0.24, 0.3, 'triangle', 1], [1046.5, 0.36, 0.5, 'triangle', 1]],
	beep: [[880, 0, 0.12, 'square', 0.45], [880, 0.22, 0.12, 'square', 0.45], [880, 0.44, 0.12, 'square', 0.45]],
	alarm: [[988, 0, 0.16, 'square', 0.5], [740, 0.18, 0.16, 'square', 0.5], [988, 0.36, 0.16, 'square', 0.5], [740, 0.54, 0.16, 'square', 0.5], [988, 0.72, 0.16, 'square', 0.5], [740, 0.9, 0.2, 'square', 0.5]],
};
