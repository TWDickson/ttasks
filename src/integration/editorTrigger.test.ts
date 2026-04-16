import { describe, expect, it } from 'vitest';
import { findTaskTrigger } from './editorTrigger';

describe('findTaskTrigger', () => {
	it('detects @task trigger before cursor', () => {
		const line = 'Work on @task plat';
		const trigger = findTaskTrigger(line, line.length);
		expect(trigger).toEqual({ start: 8, end: line.length, query: 'plat' });
	});

	it('supports custom token', () => {
		const line = 'Work on #todo plat';
		const trigger = findTaskTrigger(line, line.length, '#todo');
		expect(trigger).toEqual({ start: 8, end: line.length, query: 'plat' });
	});

	it('returns null when trigger is absent', () => {
		expect(findTaskTrigger('No trigger here', 5)).toBeNull();
	});
});
