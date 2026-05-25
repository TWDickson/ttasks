import { describe, expect, it } from 'vitest';
import { scanFileForCapturableTasks, isInCaptureScope } from './fileScanner';
import { normalizeCaptureSource } from '../settings/defaults';

describe('scanFileForCapturableTasks', () => {
	it('returns one external task per unchecked non-linked checkbox', () => {
		const config = normalizeCaptureSource({ path: 'Daily' });
		const tasks = scanFileForCapturableTasks('- [ ] A\n- [ ] B', 'Daily/2026-05-25.md', config, 'Tasks');
		expect(tasks).toHaveLength(2);
		expect(tasks.map((task) => task.name)).toEqual(['A', 'B']);
	});

	it('skips checked checkboxes', () => {
		const config = normalizeCaptureSource({ path: 'Daily' });
		const tasks = scanFileForCapturableTasks('- [x] done\n- [ ] open', 'Daily/2026-05-25.md', config, 'Tasks');
		expect(tasks).toHaveLength(1);
		expect(tasks[0].name).toBe('open');
	});

	it('skips cancelled checkboxes', () => {
		const config = normalizeCaptureSource({ path: 'Daily' });
		const tasks = scanFileForCapturableTasks('- [-] cancelled\n- [ ] open', 'Daily/2026-05-25.md', config, 'Tasks');
		expect(tasks).toHaveLength(1);
		expect(tasks[0].name).toBe('open');
	});

	it('skips ttasks wikilinks in the checkbox text', () => {
		const config = normalizeCaptureSource({ path: 'Daily' });
		const tasks = scanFileForCapturableTasks(
			'- [ ] [[Tasks/abc123-task|Task]]\n- [ ] keep me',
			'Daily/2026-05-25.md',
			config,
			'Tasks',
		);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].name).toBe('keep me');
	});

	it('only captures tasks under a matching section when sectionFilter is set', () => {
		const config = normalizeCaptureSource({ path: 'Daily', sectionFilter: 'Tasks' });
		const tasks = scanFileForCapturableTasks(
			'## Notes\n- [ ] ignore\n## Tasks\n- [ ] capture',
			'Daily/2026-05-25.md',
			config,
			'Tasks',
		);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].name).toBe('capture');
	});

	it('captures all tasks when sectionFilter is empty', () => {
		const config = normalizeCaptureSource({ path: 'Daily', sectionFilter: '' });
		const tasks = scanFileForCapturableTasks(
			'## Notes\n- [ ] A\n## Tasks\n- [ ] B',
			'Daily/2026-05-25.md',
			config,
			'Tasks',
		);
		expect(tasks).toHaveLength(2);
	});

	it('extracts emoji due dates', () => {
		const config = normalizeCaptureSource({ path: 'Daily' });
		const tasks = scanFileForCapturableTasks('- [ ] Submit report 📅 2026-05-28', 'Daily/2026-05-25.md', config, 'Tasks');
		expect(tasks[0].due_date).toBe('2026-05-28');
	});

	it('leaves date and priority fields at defaults when no emoji is present', () => {
		const config = normalizeCaptureSource({ path: 'Daily', inheritDateFromFilename: false });
		const tasks = scanFileForCapturableTasks('- [ ] Plain task', 'Daily/notes.md', config, 'Tasks');
		expect(tasks[0].due_date).toBeNull();
		expect(tasks[0].start_date).toBeNull();
		expect(tasks[0].priority).toBe('None');
	});

	it('inherits filename dates when enabled', () => {
		const config = normalizeCaptureSource({ path: 'Daily', inheritDateFromFilename: true });
		const tasks = scanFileForCapturableTasks('- [ ] filename date task', 'Daily/2026-05-25.md', config, 'Tasks');
		expect(tasks[0].start_date).toBe('2026-05-25');
	});

	it('ignores filename dates when inheritDateFromFilename is false', () => {
		const config = normalizeCaptureSource({ path: 'Daily', inheritDateFromFilename: false });
		const tasks = scanFileForCapturableTasks('- [ ] filename date task', 'Daily/2026-05-25.md', config, 'Tasks');
		expect(tasks[0].start_date).toBeNull();
	});

	it('applies config defaults for area and labels', () => {
		const config = normalizeCaptureSource({
			path: 'Daily',
			defaults: { area: 'Work', labels: ['feature'], status: null, priority: null, assignedTo: null },
		});
		const tasks = scanFileForCapturableTasks('- [ ] task', 'Daily/2026-05-25.md', config, 'Tasks');
		expect(tasks[0].area).toBe('Work');
		expect(tasks[0].labels).toEqual(['feature']);
	});

	it('lets emoji priority override config default priority', () => {
		const config = normalizeCaptureSource({
			path: 'Daily',
			defaults: { area: null, labels: [], status: null, priority: 'Low', assignedTo: null },
		});
		const tasks = scanFileForCapturableTasks('- [ ] urgent 🔺', 'Daily/2026-05-25.md', config, 'Tasks');
		expect(tasks[0].priority).toBe('High');
	});
});

describe('isInCaptureScope', () => {
	it('returns true for files inside configured directory', () => {
		const config = normalizeCaptureSource({ path: 'Daily', includeSubdirectories: true });
		expect(isInCaptureScope('Daily/2026-05-25.md', config)).toBe(true);
	});

	it('returns false for nested paths when includeSubdirectories is false', () => {
		const config = normalizeCaptureSource({ path: 'Daily', includeSubdirectories: false });
		expect(isInCaptureScope('Daily/Archive/2026-05-25.md', config)).toBe(false);
	});
});
