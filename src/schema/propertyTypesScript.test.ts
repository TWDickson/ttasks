import { describe, expect, it } from 'vitest';
import { TASK_PERSISTENCE } from './taskPersistence';
import { REPEAT_KEYS } from '../repeat/normalize';
import { applyTypes, recommendedTypes } from '../../Scripts/set-property-types.mjs';

describe('Scripts/set-property-types.mjs', () => {
	it('types every stored ttask_* key except archive history, and nothing else', () => {
		const stored = new Set<string>([
			...Object.values(TASK_PERSISTENCE).map((entry) => entry.fmKey).filter((key): key is string => key !== null),
			...Object.values(REPEAT_KEYS),
		]);
		expect(new Set(Object.keys(recommendedTypes()))).toEqual(stored);
	});

	it('sets types, reports stale legacy keys, and prunes only when asked', () => {
		const data = { types: { status: 'text', ttask_due_date: 'datetime', other: 'text' } };
		const changes: string[] = applyTypes(data);
		expect(changes.some((line) => line.includes('ttask_due_date: datetime -> date'))).toBe(true);
		expect(changes.some((line) => line.includes('stale') && line.includes('status'))).toBe(true);
		expect(data.types).toHaveProperty('status');

		applyTypes(data, { prune: true });
		expect(data.types).not.toHaveProperty('status');
		expect(data.types).toHaveProperty('other', 'text');
	});
});
