/**
 * Agenda date-bucket definitions — the single source of truth for the keys, their
 * order, display labels, and accent colors. Shared by the query engine (which
 * assigns tasks to buckets) and the TaskAgenda view (which renders them), so the
 * two can never drift apart.
 */

export type AgendaBucketKey = 'overdue' | 'today' | 'tomorrow' | 'this-week' | 'next-week' | 'later' | 'no-date';

export const AGENDA_BUCKET_ORDER: AgendaBucketKey[] = [
	'overdue', 'today', 'tomorrow', 'this-week', 'next-week', 'later', 'no-date',
];

export const AGENDA_BUCKET_LABELS: Record<AgendaBucketKey, string> = {
	'overdue':   'Overdue',
	'today':     'Today',
	'tomorrow':  'Tomorrow',
	'this-week': 'This Week',
	'next-week': 'Next Week',
	'later':     'Later',
	'no-date':   'No Date',
};

export const AGENDA_BUCKET_COLORS: Record<AgendaBucketKey, string> = {
	'overdue':   'var(--color-red)',
	'today':     'var(--interactive-accent)',
	'tomorrow':  'var(--color-orange)',
	'this-week': 'var(--text-muted)',
	'next-week': 'var(--text-muted)',
	'later':     'var(--text-muted)',
	'no-date':   'var(--text-faint)',
};

export function isAgendaBucketKey(value: string): value is AgendaBucketKey {
	return (AGENDA_BUCKET_ORDER as string[]).includes(value);
}
