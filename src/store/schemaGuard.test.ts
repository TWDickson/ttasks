import { describe, expect, it } from 'vitest';
import { assessVault, classifyNote, schemaNotice } from './schemaGuard';

describe('classifyNote', () => {
	it('recognises current, legacy and unrelated notes', () => {
		expect(classifyNote({ ttask_type: 'task', ttask_name: 'A' })).toBe('current');
		expect(classifyNote({ type: 'task', name: 'A', status: 'Active' })).toBe('legacy');
		expect(classifyNote({ type: 'project', name: 'P' })).toBe('legacy');
		expect(classifyNote({ type: 'meeting', name: 'Notes' })).toBe('other');
		expect(classifyNote({ title: 'x' })).toBe('other');
		expect(classifyNote(null)).toBe('other');
	});

	it('a migrated note that kept a foreign "name" property is still current', () => {
		expect(classifyNote({ ttask_name: 'A', type: 'task', name: 'something else' })).toBe('current');
	});
});

describe('assessVault', () => {
	const current = { ttask_type: 'task', ttask_name: 'A' };
	const legacy = { type: 'task', name: 'B' };

	it('is ok with nothing old', () => {
		expect(assessVault([current, current, { title: 'x' }])).toEqual({ kind: 'ok' });
		expect(assessVault([])).toEqual({ kind: 'ok' });
	});

	it('flags a vault the script has not touched', () => {
		expect(assessVault([legacy, legacy, { title: 'x' }])).toEqual({ kind: 'unmigrated', legacy: 2 });
	});

	it('flags stray old-format notes in a migrated vault', () => {
		expect(assessVault([current, legacy, current])).toEqual({ kind: 'stray-legacy', legacy: 1, current: 2 });
	});
});

describe('schemaNotice', () => {
	it('says nothing when all is well, and names the script otherwise', () => {
		expect(schemaNotice({ kind: 'ok' })).toBeNull();
		expect(schemaNotice({ kind: 'unmigrated', legacy: 3 })).toContain('migrate-prefixed-schema.mjs');
		expect(schemaNotice({ kind: 'stray-legacy', legacy: 1, current: 9 })).toContain('1 task note still uses');
	});
});
