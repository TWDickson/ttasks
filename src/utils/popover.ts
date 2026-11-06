/**
 * Anchored menus — a dropdown that opens under its trigger button.
 *
 * Two paths, chosen once per component by `supportsNativePopover()`:
 *
 * - **Native** (Chromium, iOS/iPadOS 17+): the menu carries `popover="auto"`
 *   and the trigger `popovertarget`, so the browser owns open/close and
 *   light-dismiss and renders the menu in the **top layer** — above a scaled
 *   graph node or a clipping parent, which a z-index can't promise. A top-layer
 *   element is no longer positioned against its parent, so this action places it
 *   under the trigger (flipping above or clamping to the viewport when it won't
 *   fit) and follows scroll and resize while open.
 * - **Fallback** (iOS 15–16, the floor Obsidian mobile supports, and jsdom):
 *   the component renders the menu only while open and positions it with CSS;
 *   this action supplies the click-outside close.
 *
 * Both paths keep a **capture-phase Escape** handler. Native light-dismiss closes
 * the menu, but it doesn't stop the keypress from reaching the board's
 * `document` shortcut handler, which would also clear the search. Capture runs
 * first, and stopping propagation there keeps the keypress away from the board.
 *
 * DOM-only: no Obsidian import (boundary-listed).
 */

export function supportsNativePopover(): boolean {
	return typeof HTMLElement !== 'undefined'
		&& Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'popover');
}

let sequence = 0;
/** A document-unique id, for wiring `popovertarget` to its menu. */
export function popoverId(prefix: string): string {
	sequence += 1;
	return `${prefix}-${sequence}`;
}

export interface MenuPopoverOptions {
	/** The trigger button. The menu is placed against it; clicks on it don't count as "outside". */
	anchor: HTMLElement | null | undefined;
	/** From `supportsNativePopover()` — fixed for the component's lifetime. */
	native: boolean;
	/** Line the menu up with the trigger's left (`start`) or right (`end`) edge. */
	align?: 'start' | 'end';
	/** Space between trigger and menu, in px. */
	gap?: number;
	/** The menu opened or closed by itself — light-dismiss, Escape, or the trigger (native). */
	onOpenChange: (open: boolean) => void;
}

/** Keep this far from the viewport edge, in px. */
const EDGE_MARGIN = 8;
/** Never squeeze a flipped or clamped menu shorter than this, in px. */
const MIN_HEIGHT = 120;

export interface MenuPlacement {
	top: number;
	left: number;
	/** Set only when the menu has to shrink to fit. */
	maxHeight: number | null;
}

/**
 * Where a menu of `size` goes under `anchor` in a `viewport`-sized window.
 * Pure, so the geometry is unit-tested without a layout engine.
 */
export function placeMenu(
	anchor: { top: number; bottom: number; left: number; right: number },
	size: { width: number; height: number },
	viewport: { width: number; height: number },
	align: 'start' | 'end' = 'start',
	gap = 4,
): MenuPlacement {
	const preferred = align === 'end' ? anchor.right - size.width : anchor.left;
	const left = Math.max(EDGE_MARGIN, Math.min(preferred, viewport.width - size.width - EDGE_MARGIN));

	const below = viewport.height - anchor.bottom - gap - EDGE_MARGIN;
	const above = anchor.top - gap - EDGE_MARGIN;
	const flip = size.height > below && above > below;
	const room = Math.max(MIN_HEIGHT, flip ? above : below);
	const height = Math.min(size.height, room);

	return {
		top: flip ? anchor.top - gap - height : anchor.bottom + gap,
		left,
		maxHeight: size.height > room ? room : null,
	};
}

/** Svelte action for the menu element. See the module comment for the two paths. */
export function menuPopover(node: HTMLElement, options: MenuPopoverOptions) {
	let opts = options;
	let frame = 0;
	/* Tracked from `toggle` (which is queued, not synchronous) as well as read
	   live, so an Escape still counts as "open" even if the browser's own
	   light-dismiss hid the menu before the keydown reached us. */
	let nativeOpen = false;

	const isOpen = (): boolean => (opts.native ? nativeOpen || node.matches(':popover-open') : true);

	function close(): void {
		if (opts.native) node.hidePopover();
		else opts.onOpenChange(false);
	}

	function position(): void {
		const anchor = opts.anchor;
		if (!opts.native || !anchor || !isOpen()) return;
		node.style.maxHeight = '';
		const place = placeMenu(
			anchor.getBoundingClientRect(),
			{ width: node.offsetWidth, height: node.offsetHeight },
			{ width: document.documentElement.clientWidth, height: window.innerHeight },
			opts.align,
			opts.gap,
		);
		node.style.top = `${place.top}px`;
		node.style.left = `${place.left}px`;
		if (place.maxHeight !== null) node.style.maxHeight = `${place.maxHeight}px`;
	}

	function schedulePosition(event?: Event): void {
		// Scrolling the menu's own list mustn't re-measure (and reset) the menu.
		if (event?.target instanceof Node && node.contains(event.target)) return;
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(position);
	}

	function onToggle(): void {
		const open = node.matches(':popover-open');
		nativeOpen = open;
		opts.onOpenChange(open);
		if (open) {
			position();
			window.addEventListener('resize', schedulePosition);
			document.addEventListener('scroll', schedulePosition, true);
		} else {
			window.removeEventListener('resize', schedulePosition);
			document.removeEventListener('scroll', schedulePosition, true);
		}
	}

	function onKeyDown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !isOpen()) return;
		event.stopPropagation();
		close();
	}

	function onPointerDown(event: PointerEvent): void {
		if (opts.native) return;
		const target = event.target as Node | null;
		if (target && (node.contains(target) || opts.anchor?.contains(target))) return;
		opts.onOpenChange(false);
	}

	if (opts.native) node.addEventListener('toggle', onToggle);
	window.addEventListener('keydown', onKeyDown, true);
	document.addEventListener('pointerdown', onPointerDown, true);

	return {
		update(next: MenuPopoverOptions): void {
			opts = next;
		},
		destroy(): void {
			cancelAnimationFrame(frame);
			node.removeEventListener('toggle', onToggle);
			window.removeEventListener('keydown', onKeyDown, true);
			document.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('resize', schedulePosition);
			document.removeEventListener('scroll', schedulePosition, true);
		},
	};
}
