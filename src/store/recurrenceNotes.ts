/**
 * Preserve task notes on recurrence while resetting checklist completion state.
 *
 * Converts markdown checklist markers from [x]/[X] to [ ] and leaves all other
 * note content unchanged.
 */
export function resetChecklistCompletionInNotes(notes: string): string {
	if (!notes) return notes;

	return notes.replace(/^([ \t]*(?:[-*+]|\d+\.)\s+\[)(x|X)(\])/gm, '$1 $3');
}
