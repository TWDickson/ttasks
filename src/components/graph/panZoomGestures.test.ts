import { describe, expect, it, vi } from 'vitest';
import { createPanZoomGestures, PAN_THRESHOLD_PX, type PanZoomHost } from './panZoomGestures';

/** A target whose `closest()` matches when any listed class is in the selector. */
function target(...classes: string[]): Element {
	return { closest: (selector: string) => (classes.some((c) => selector.includes(c)) ? {} : null) } as unknown as Element;
}
const CANVAS = target();
const NODE = target('.tt-graph-node');
const BUTTON = target('button');

function pointer(type: 'mouse' | 'touch', id: number, x: number, y: number, on: Element = CANVAS): PointerEvent {
	return { pointerType: type, pointerId: id, clientX: x, clientY: y, button: 0, target: on } as unknown as PointerEvent;
}

function setup() {
	const el = { scrollLeft: 100, scrollTop: 50, setPointerCapture: vi.fn() };
	const host: PanZoomHost = {
		scrollEl: () => el as unknown as HTMLElement,
		zoomBy: vi.fn(),
		onDragStart: vi.fn(),
		onEmptyTap: vi.fn(),
		onPanningChange: vi.fn(),
		onScroll: vi.fn(),
	};
	return { el, host, gestures: createPanZoomGestures(host) };
}

describe('panZoomGestures', () => {
	it('treats a stationary press on bare canvas as a tap, without capturing', () => {
		const { el, host, gestures } = setup();
		gestures.pointerdown(pointer('mouse', 1, 10, 10));
		gestures.pointermove(pointer('mouse', 1, 12, 11)); // inside the threshold
		gestures.pointerup(pointer('mouse', 1, 12, 11));
		expect(host.onEmptyTap).toHaveBeenCalledOnce();
		expect(host.onDragStart).not.toHaveBeenCalled();
		expect(el.setPointerCapture).not.toHaveBeenCalled();
		expect(gestures.moved).toBe(false);
	});

	// The double-tap-to-open bug: capturing the pointer on a tap swallowed the
	// node's click on touch. A tap on a node must neither capture nor count as
	// an empty-canvas tap.
	it('leaves a tap on a node to the node', () => {
		const { el, host, gestures } = setup();
		gestures.pointerdown(pointer('touch', 1, 10, 10, NODE));
		gestures.pointerup(pointer('touch', 1, 10, 10, NODE));
		expect(el.setPointerCapture).not.toHaveBeenCalled();
		expect(host.onEmptyTap).not.toHaveBeenCalled();
		expect(gestures.moved).toBe(false);
	});

	it('pans once the press moves past the threshold', () => {
		const { el, host, gestures } = setup();
		gestures.pointerdown(pointer('mouse', 1, 10, 10));
		gestures.pointermove(pointer('mouse', 1, 10 + PAN_THRESHOLD_PX + 1, 10));
		expect(host.onDragStart).toHaveBeenCalledOnce();
		expect(host.onPanningChange).toHaveBeenLastCalledWith(true);
		expect(el.setPointerCapture).toHaveBeenCalledWith(1);
		gestures.pointermove(pointer('mouse', 1, 40, 30));
		expect(el.scrollLeft).toBe(100 - 30);
		expect(el.scrollTop).toBe(50 - 20);
		expect(host.onScroll).toHaveBeenCalled();
		gestures.pointerup(pointer('mouse', 1, 40, 30));
		expect(gestures.moved).toBe(true); // a node's pointerup reads this
		expect(host.onEmptyTap).not.toHaveBeenCalled();
		expect(host.onPanningChange).toHaveBeenLastCalledWith(false);
	});

	it('never starts a pan from a control', () => {
		const { host, gestures } = setup();
		gestures.pointerdown(pointer('mouse', 1, 10, 10, BUTTON));
		gestures.pointermove(pointer('mouse', 1, 80, 80, BUTTON));
		expect(host.onDragStart).not.toHaveBeenCalled();
	});

	it('pinch-zooms by the finger-distance ratio about the midpoint', () => {
		const { host, gestures } = setup();
		gestures.pointerdown(pointer('touch', 1, 0, 0));
		gestures.pointerdown(pointer('touch', 2, 100, 0));
		gestures.pointermove(pointer('touch', 2, 200, 0));
		expect(host.zoomBy).toHaveBeenCalledWith(2, { clientX: 100, clientY: 0 });
		expect(host.onDragStart).not.toHaveBeenCalled();
	});

	it('hands the remaining finger back to panning when one pinch finger lifts', () => {
		const { el, host, gestures } = setup();
		gestures.pointerdown(pointer('touch', 1, 0, 0));
		gestures.pointerdown(pointer('touch', 2, 100, 0));
		gestures.pointerup(pointer('touch', 2, 100, 0));
		expect(host.onPanningChange).toHaveBeenLastCalledWith(true);
		gestures.pointermove(pointer('touch', 1, 20, 0));
		expect(el.scrollLeft).toBe(80); // panned from where the finger was, no jump
	});
});
