import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EXTRA_FM_KEYS, TASK_PERSISTENCE, fmKey } from '../schema/taskPersistence';

/**
 * MD-0: outside the codec, a note's properties are reached through `fmKey()` /
 * `EXTRA_FM_KEYS`, never a literal — so MD-1's rename is an edit to
 * `TASK_PERSISTENCE` alone. A literal here would silently keep reading the old
 * name after the cutover.
 *
 * `TaskMigrations` is exempt: it is dev-era code that names *legacy* keys on
 * purpose and is deleted by MD-4.
 */
const EXEMPT = new Set(['TaskMigrations.ts']);

const storedKeys = [
	...Object.values(TASK_PERSISTENCE).flatMap((p) => (p.fmKey === null ? [] : [p.fmKey])),
	...Object.values(EXTRA_FM_KEYS),
];

function storeSources(): { name: string; text: string }[] {
	const dir = resolve(process.cwd(), 'src/store');
	return readdirSync(dir)
		.filter((f) => f.endsWith('.ts') && !/\.test\.ts$/.test(f) && !EXEMPT.has(f))
		.map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }));
}

describe('frontmatter key access', () => {
	it('fmKey returns the table key and refuses derived fields', () => {
		expect(fmKey('due_date')).toBe(TASK_PERSISTENCE.due_date.fmKey);
		expect(() => fmKey('path')).toThrow(/not stored in frontmatter/);
	});

	it('store code never names a stored key as a property or string literal on frontmatter', () => {
		const offenders: string[] = [];
		for (const { name, text } of storeSources()) {
			for (const key of storedKeys) {
				const member = new RegExp(`\\b(?:fm|frontmatter)\\??\\.${key}\\b`);
				const bracket = new RegExp(`\\b(?:fm|frontmatter)\\[\\s*['"]${key}['"]\\s*\\]`);
				if (member.test(text) || bracket.test(text)) offenders.push(`${name}: ${key}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
