import { describe, expect, it } from 'vitest';
import {
	canToggleLogbookRenderer,
	resolveViewRenderer,
	toggleLogbookRendererMode,
} from './logbookViewMode';

describe('canToggleLogbookRenderer', () => {
	it('is enabled only for the logbook view id', () => {
		expect(canToggleLogbookRenderer('logbook')).toBe(true);
		expect(canToggleLogbookRenderer('kanban')).toBe(false);
		expect(canToggleLogbookRenderer('list')).toBe(false);
	});
});

describe('resolveViewRenderer', () => {
	it('defaults logbook renderer to list when no mode override exists', () => {
		expect(resolveViewRenderer('logbook', 'list', {})).toBe('list');
		expect(resolveViewRenderer('logbook', 'kanban', {})).toBe('list');
	});

	it('returns kanban for logbook when override is set', () => {
		expect(resolveViewRenderer('logbook', 'list', { logbook: 'kanban' })).toBe('kanban');
	});

	it('never overrides non-logbook renderers', () => {
		expect(resolveViewRenderer('kanban', 'kanban', { kanban: 'list' })).toBe('kanban');
		expect(resolveViewRenderer('agenda', 'agenda', { agenda: 'kanban' })).toBe('agenda');
	});

	describe('toggleLogbookRendererMode', () => {
		it('flips logbook between list and kanban modes', () => {
			expect(toggleLogbookRendererMode('logbook', {})).toEqual({ logbook: 'kanban' });
			expect(toggleLogbookRendererMode('logbook', { logbook: 'kanban' })).toEqual({ logbook: 'list' });
		});

		it('does not modify override map for non-logbook views', () => {
			const original = { agenda: 'kanban' as const };
			expect(toggleLogbookRendererMode('agenda', original)).toBe(original);
		});
	});
});
