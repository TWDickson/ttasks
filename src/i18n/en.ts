/**
 * The English UI strings — the single place to change the plugin's wording.
 *
 * Grouped by surface, then by control. A `{name}` placeholder is a parameter:
 * `t()` makes the caller supply every one the message names (a missing or
 * misspelled one is a type error), so a message and its call sites can't drift.
 *
 * Only **UI wording** belongs here. User data — status, priority, area and label
 * names — is shown exactly as configured and never passes through `t()`:
 * translating it would change what's written to the notes.
 */
export const en = {
	filter: {
		/** Trigger's accessible name with nothing selected. */
		filterBy: 'Filter by {label}',
		/** Trigger's accessible name with a selection: "Status: Active, Hold". */
		selection: '{label}: {values}',
		clear: 'Clear {label}',
	},
	graph: {
		projectFilter: {
			pill: 'Projects',
			all: 'All',
			hidden: '{count} hidden',
			title: 'Show projects',
			showAll: 'Show all',
		},
	},
} as const;
