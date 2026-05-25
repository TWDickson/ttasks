import { describe, expect, it } from 'vitest';
import {
	normalizeCaptureSource,
	normalizeCaptureSourceDefaults,
} from './defaults';
import {
	buildAutoDetectedSources,
	detectRolloverPlugin,
	mergeAutoDetectedSources,
} from './captureSourcesSettings';

describe('normalizeCaptureSourceDefaults', () => {
	it('defaults labels to an empty array when missing', () => {
		expect(normalizeCaptureSourceDefaults({})).toMatchObject({ labels: [] });
	});
});

describe('normalizeCaptureSource', () => {
	it('defaults inheritDateFromFilename to true when missing', () => {
		expect(normalizeCaptureSource({ path: 'Daily' }).inheritDateFromFilename).toBe(true);
	});

	it('defaults mode to auto-capture when missing', () => {
		expect(normalizeCaptureSource({ path: 'Daily' }).mode).toBe('auto-capture');
	});
});

describe('mergeAutoDetectedSources', () => {
	it('injects detected paths that are missing from existing settings', () => {
		const merged = mergeAutoDetectedSources(
			[{ ...normalizeCaptureSource({ path: 'Daily' }), mode: 'manual' }],
			[normalizeCaptureSource({ path: 'Periodic/Weekly' })],
		);

		expect(merged.map((entry) => entry.path)).toEqual(['Daily', 'Periodic/Weekly']);
	});

	it('does not duplicate existing paths', () => {
		const merged = mergeAutoDetectedSources(
			[{ ...normalizeCaptureSource({ path: 'Daily' }), mode: 'manual' }],
			[{ ...normalizeCaptureSource({ path: 'Daily' }), mode: 'auto-capture' }],
		);

		expect(merged).toHaveLength(1);
	});

	it('does not overwrite existing entries with detected defaults', () => {
		const existing = [{ ...normalizeCaptureSource({ path: 'Daily' }), mode: 'manual' as const }];
		const detected = [{ ...normalizeCaptureSource({ path: 'Daily' }), mode: 'auto-capture' as const }];
		const merged = mergeAutoDetectedSources(existing, detected);

		expect(merged[0].mode).toBe('manual');
	});
});

describe('detectRolloverPlugin', () => {
	it('returns true when rollover daily todos plugin is loaded', () => {
		const app = {
			plugins: {
				plugins: {
					'obsidian-rollover-daily-todos': {},
				},
			},
		} as any;

		expect(detectRolloverPlugin(app)).toBe(true);
	});

	it('returns false when rollover plugin is absent', () => {
		const app = {
			plugins: {
				plugins: {
					'other-plugin': {},
				},
			},
		} as any;

		expect(detectRolloverPlugin(app)).toBe(false);
	});
});

describe('buildAutoDetectedSources', () => {
	it('returns one source per detected non-empty folder without duplicates', () => {
		const app = {} as any;
		const sources = buildAutoDetectedSources(app, () => ({
			getDailyNoteSettings: () => ({ folder: 'Daily' }),
			getWeeklyNoteSettings: () => ({ folder: 'Periodic/Weekly' }),
			getMonthlyNoteSettings: () => ({ folder: '' }),
			getQuarterlyNoteSettings: () => ({ folder: 'Periodic/Quarterly' }),
			getYearlyNoteSettings: () => ({ folder: 'Periodic/Weekly' }),
		}));

		expect(sources.map((entry) => entry.path)).toEqual([
			'Daily',
			'Periodic/Weekly',
			'Periodic/Quarterly',
		]);
	});
});