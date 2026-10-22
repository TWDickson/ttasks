/**
 * Drag-to-pan and two-finger pinch-zoom for the dependency graph's scroll
 * surface. DOM-only (no Obsidian, no Svelte) so the tap/drag/pinch rules are
 * testable on their own — they have produced real bugs (double-tap-to-open).
 *
 * The host owns the scroll element and the zoom level; this owns the gesture.
 */

export interface PointerPoint {
	clientX: number;
	clientY: number;
}

export interface PanZoomHost {
	scrollEl(): HTMLElement | null;
	/** Multiply the zoom, keeping `anchor` (client coords) fixed on screen. */
	zoomBy(factor: number, anchor: PointerPoint): void;
	/** A press became a real drag. */
	onDragStart(): void;
	/** A stationary tap on bare canvas — not a node, control or lane header. */
	onEmptyTap(): void;
	onPanningChange(panning: boolean): void;
	/** The scroll position moved under the gesture. */
	onScroll(): void;
}

/** Elements that own their own presses; a press on one never starts a pan. */
const CONTROL_SELECTOR = 'button, a, input, .tt-dependency-lane-header';
/** What doesn't count as bare canvas for a tap. */
const NOT_CANVAS_SELECTOR = `.tt-graph-node, ${CONTROL_SELECTOR}`;
export const PAN_THRESHOLD_PX = 8;

export interface PanZoomGestures {
	pointerdown(event: PointerEvent): void;
	pointermove(event: PointerEvent): void;
	pointerup(event: PointerEvent): void;
	/** Whether the last press turned into a drag — a node's pointerup checks this. */
	readonly moved: boolean;
}

export function createPanZoomGestures(host: PanZoomHost): PanZoomGestures {
	let isPanning = false;
	let panStart = { x: 0, y: 0, scrollX: 0, scrollY: 0 };
	// A press starts as a *pending* pan, not a live one: we only begin panning (and
	// capture the pointer) once the finger/mouse moves past PAN_THRESHOLD_PX. A
	// stationary tap never captures, so a node's own `click` dispatches normally —
	// on touch, capturing during a tap swallows that click (the double-tap-to-open
	// bug). `panMoved` records whether the gesture became a drag so pointerup can
	// tell a tap from a drag.
	let panPending = false;
	let panMoved = false;

	// Two-finger pinch-to-zoom. Every live touch point is tracked; with two down
	// we zoom by their distance ratio and anchor at the pinch midpoint. Panning is
	// suspended while pinching.
	const activePointers = new Map<number, { x: number; y: number }>();
	let pinchLastDist = 0;

	const setPanning = (next: boolean): void => {
		if (next === isPanning) return;
		isPanning = next;
		host.onPanningChange(next);
	};

	const pinchDistance = (): number => {
		const pts = [...activePointers.values()];
		if (pts.length < 2) return 0;
		return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
	};

	const pinchMidpoint = (): PointerPoint => {
		const pts = [...activePointers.values()];
		return { clientX: (pts[0].x + pts[1].x) / 2, clientY: (pts[0].y + pts[1].y) / 2 };
	};

	const closest = (event: PointerEvent, selector: string): boolean =>
		!!(event.target as HTMLElement | null)?.closest?.(selector);

	return {
		get moved() {
			return panMoved;
		},

		pointerdown(event) {
			const el = host.scrollEl();
			if (!el) return;
			// Track touch points for pinch detection even when a tap lands on a node
			// button — the event still bubbles to this scroll surface.
			if (event.pointerType === 'touch') {
				activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
				if (activePointers.size === 2) {
					// Entering a pinch: cancel any in-progress or pending pan.
					setPanning(false);
					panPending = false;
					pinchLastDist = pinchDistance();
					return;
				}
				if (activePointers.size > 2) return;
			}
			if (event.button !== 0) return;
			// Lane header chips (incl. their bare padding between buttons) are inert
			// to pan and never clear the pin — the chip's own buttons act.
			if (closest(event, CONTROL_SELECTOR)) return;
			// Arm a *pending* pan; the real start waits for movement (see pointermove).
			panPending = true;
			panMoved = false;
			panStart = { x: event.clientX, y: event.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop };
		},

		pointermove(event) {
			if (event.pointerType === 'touch' && activePointers.has(event.pointerId)) {
				activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
			}
			if (activePointers.size >= 2) {
				const dist = pinchDistance();
				if (pinchLastDist > 0 && dist > 0) host.zoomBy(dist / pinchLastDist, pinchMidpoint());
				pinchLastDist = dist;
				return;
			}
			const el = host.scrollEl();
			// Promote a pending press to a live pan once it clearly moves — only now
			// capture the pointer and tell the host a drag began.
			if (panPending && !isPanning && el) {
				if (Math.hypot(event.clientX - panStart.x, event.clientY - panStart.y) > PAN_THRESHOLD_PX) {
					setPanning(true);
					panMoved = true;
					host.onDragStart();
					el.setPointerCapture(event.pointerId);
				}
			}
			if (!isPanning || !el) return;
			el.scrollLeft = panStart.scrollX - (event.clientX - panStart.x);
			el.scrollTop = panStart.scrollY - (event.clientY - panStart.y);
			host.onScroll();
		},

		pointerup(event) {
			// A stationary press that never became a drag is a tap. On bare canvas
			// that's the host's cue (clear the pinned chain); on a node it's left
			// alone so the node's own click opens the task.
			if (panPending && !panMoved && !closest(event, NOT_CANVAS_SELECTOR)) host.onEmptyTap();
			panPending = false;
			activePointers.delete(event.pointerId);
			const el = host.scrollEl();
			if (activePointers.size < 2) {
				pinchLastDist = 0;
				// Hand a lingering single finger back to panning from its current spot
				// so lifting one pinch finger doesn't jump the graph.
				if (activePointers.size === 1 && el) {
					const [pt] = [...activePointers.values()];
					setPanning(true);
					panStart = { x: pt.x, y: pt.y, scrollX: el.scrollLeft, scrollY: el.scrollTop };
				}
			}
			if (activePointers.size === 0) setPanning(false);
		},
	};
}
