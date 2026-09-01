import { describe, expect, it } from 'vitest';
import { buildStatusPolicy } from './statusPolicy';

const FULL = {
	statuses: ['Active', 'In Progress', 'Blocked', 'Hold', 'Future', 'Completed'],
	completionStatus: 'Completed',
	quickActions: { startStatus: 'In Progress', blockStatus: 'Blocked', holdStatus: 'Hold' },
	futureStatus: 'Future',
};

describe('buildStatusPolicy', () => {
	it('resolves every pointer from a fully configured vault', () => {
		const policy = buildStatusPolicy(FULL);

		expect(policy.all).toEqual(FULL.statuses);
		expect(policy.initial).toBe('Active');
		expect(policy.completion).toBe('Completed');
		expect(policy.start).toBe('In Progress');
		expect(policy.block).toBe('Blocked');
		expect(policy.hold).toBe('Hold');
		expect(policy.future).toBe('Future');
	});

	it('takes the first status as the initial one', () => {
		expect(buildStatusPolicy({ statuses: ['Todo', 'Doing'] }).initial).toBe('Todo');
	});

	describe('stale pointers', () => {
		it('re-resolves a completion status that is no longer in the list', () => {
			// The user renamed 'Completed' to 'Shipped' without updating the pointer.
			const policy = buildStatusPolicy({
				statuses: ['Active', 'Shipped'],
				completionStatus: 'Completed',
			});

			expect(policy.completion).toBe('Active');
			expect(policy.isComplete('Completed')).toBe(false);
		});

		it('falls back to the preferred default for a stale quick-action status', () => {
			const policy = buildStatusPolicy({
				statuses: ['Active', 'In Progress', 'Blocked'],
				quickActions: { startStatus: 'Gone', blockStatus: 'Gone' },
			});

			expect(policy.start).toBe('In Progress');
			expect(policy.block).toBe('Blocked');
		});
	});

	describe('hold — absence is a value, not a fallback', () => {
		it('is null when the vault has no Hold status', () => {
			// The load-bearing case: falling back to the first status here would make
			// every Active task read as impeded and cascade a bogus Hold across the
			// whole dependency graph.
			const policy = buildStatusPolicy({ statuses: ['Active', 'Completed'] });

			expect(policy.hold).toBeNull();
		});

		it('is null rather than an empty string when the setting is blank', () => {
			const policy = buildStatusPolicy({
				statuses: ['Active', 'Hold'],
				quickActions: { holdStatus: '' },
			});

			// Blank falls through to the preferred default, which this vault has.
			expect(policy.hold).toBe('Hold');
		});

		it('is null when both the configured and preferred names are missing', () => {
			const policy = buildStatusPolicy({
				statuses: ['Active'],
				quickActions: { holdStatus: 'Parked' },
			});

			expect(policy.hold).toBeNull();
		});

		it('never resolves hold to the first status', () => {
			for (const statuses of [['Active'], ['Active', 'Done'], ['Todo', 'Doing', 'Done']]) {
				expect(buildStatusPolicy({ statuses }).hold).toBeNull();
			}
		});
	});

	describe('future — absence is a value, not a fallback', () => {
		it('is null when the vault has no Future status', () => {
			// Same load-bearing case as hold: Future propagates down dependency
			// edges, so a bogus fallback would mark the whole graph Future.
			expect(buildStatusPolicy({ statuses: ['Active', 'Completed'] }).future).toBeNull();
		});

		it('is null when the configured name is no longer in the list', () => {
			const policy = buildStatusPolicy({ statuses: ['Active'], futureStatus: 'Later' });

			expect(policy.future).toBeNull();
		});

		it('honours a renamed future status', () => {
			const policy = buildStatusPolicy({ statuses: ['Active', 'Later'], futureStatus: 'Later' });

			expect(policy.future).toBe('Later');
		});

		it('never resolves future to the first status', () => {
			for (const statuses of [['Active'], ['Active', 'Done'], ['Todo', 'Doing', 'Done']]) {
				expect(buildStatusPolicy({ statuses }).future).toBeNull();
			}
		});
	});

	describe('isComplete / isSystem', () => {
		it('matches the resolved completion status, not the literal "Completed"', () => {
			const policy = buildStatusPolicy({ statuses: ['Active', 'Shipped'], completionStatus: 'Shipped' });

			expect(policy.isComplete('Shipped')).toBe(true);
			expect(policy.isComplete('Completed')).toBe(false);
			expect(policy.isSystem('Shipped')).toBe(true);
			expect(policy.isSystem('Active')).toBe(false);
		});
	});

	describe('degenerate settings', () => {
		it('survives absent settings', () => {
			for (const policy of [buildStatusPolicy(null), buildStatusPolicy(undefined), buildStatusPolicy({})]) {
				expect(policy.all).toEqual([]);
				expect(policy.initial).toBe('Active');
				expect(policy.completion).toBe('Active');
				expect(policy.hold).toBeNull();
				expect(policy.future).toBeNull();
			}
		});

		it('survives an absent quickActions block', () => {
			const policy = buildStatusPolicy({ statuses: ['Active', 'Blocked'] });

			expect(policy.block).toBe('Blocked');
			expect(policy.start).toBe('Active');
		});
	});

	it('is idempotent against an already-normalised settings object', () => {
		// normalizeSettingsFromSources resolves every pointer on load and on each
		// saveSettings, so building a policy from its output must be a no-op —
		// that is what makes it safe to read the policy instead of re-resolving.
		const once = buildStatusPolicy(FULL);
		const twice = buildStatusPolicy({
			statuses: [...once.all],
			completionStatus: once.completion,
			quickActions: { startStatus: once.start, blockStatus: once.block, holdStatus: once.hold },
		});

		expect(twice.completion).toBe(once.completion);
		expect(twice.start).toBe(once.start);
		expect(twice.block).toBe(once.block);
		expect(twice.hold).toBe(once.hold);
		expect(twice.initial).toBe(once.initial);
	});
});
