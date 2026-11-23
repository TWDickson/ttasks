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
		/** The hover controls on a card: the `+` handles, the move grip, break-link. */
		handle: {
			addBefore: 'New task before “{name}”',
			addAfter: 'New task after “{name}”',
			/** Tooltip on both `+` handles. */
			hint: 'Click for a new task, or drag onto a card to link it',
			move: 'Drag to move “{name}”',
			unlink: 'Remove link: “{dependent}” waits on “{blocker}”',
		},
		/** The live label next to the pointer while dragging. */
		drop: {
			/** Dragged from a card's left `+`: the target becomes its blocker. */
			linkBefore: '“{target}” must finish first',
			/** Dragged from a card's right `+`: the target waits on it. */
			linkAfter: '“{target}” waits on this',
			insertBefore: 'Insert before “{target}”',
			moveToLane: 'Move to {lane}',
			refused: {
				cycle: 'Would create a dependency loop',
				exists: 'Already linked',
				self: 'Same task',
				noop: 'Already here',
				'not-task': 'Not a task',
			},
		},
		notice: {
			linked: 'TTasks: “{dependent}” now waits on “{blocker}”',
			unlinked: 'TTasks: “{dependent}” no longer waits on “{blocker}”',
			inserted: 'TTasks: moved “{name}” before “{target}”',
			moved: 'TTasks: moved “{name}” to {lane}',
			refused: 'TTasks: not changed. {reason}',
			failed: 'TTasks: graph edit failed. {error}',
		},
	},
	detail: {
		/** `blocked_reason`, shown for the blocked and hold statuses. */
		reasonLabel: 'Reason',
	},
	contextMenu: {
		/** A new task this one waits on, so it comes before it in the chain. */
		createBefore: 'New task before this',
		/** A new task that waits on this one. */
		createAfter: 'New task after this',
		/** Copies the 6-hex id from the filename — what the CLI and `obsidian://ttasks` take. */
		copyId: 'Copy task ID',
		copiedId: 'TTasks: copied task ID {id}',
		copyFailed: 'TTasks: could not copy to the clipboard',
	},
	relationships: {
		/** Groups in the detail pane's "Add a dependency" picker. */
		picker: {
			placeholder: '+ Add a dependency…',
			ariaLabel: 'Add a dependency',
			/** A project group whose project record isn't loaded (never a path-derived name). */
			unknownProject: 'Other project',
			sameProject: 'This project',
			noProject: 'No project',
			done: 'Done',
		},
	},
} as const;
