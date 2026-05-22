export type FocusDirection = 'next' | 'prev';

/**
 * Returns the next focused path for linear keyboard navigation.
 * - Empty path list => null.
 * - Missing current path => first (next) or last (prev).
 * - Navigation is clamped at ends (no wrap-around).
 */
export function moveBoardFocus(
	orderedPaths: string[],
	currentPath: string | null,
	direction: FocusDirection,
): string | null {
	if (orderedPaths.length === 0) return null;

	const currentIndex = currentPath ? orderedPaths.indexOf(currentPath) : -1;
	if (currentIndex < 0) {
		return direction === 'next' ? orderedPaths[0] : orderedPaths[orderedPaths.length - 1];
	}

	if (direction === 'next') {
		return orderedPaths[Math.min(orderedPaths.length - 1, currentIndex + 1)];
	}
	return orderedPaths[Math.max(0, currentIndex - 1)];
}
