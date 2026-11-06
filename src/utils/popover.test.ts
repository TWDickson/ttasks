import { describe, expect, it } from 'vitest';
import { placeMenu, popoverId } from './popover';

const viewport = { width: 400, height: 800 };
const anchor = (left: number, top: number, width = 80, height = 30) =>
	({ left, top, right: left + width, bottom: top + height });

describe('placeMenu', () => {
	it('drops the menu under its trigger, lined up with the left edge', () => {
		expect(placeMenu(anchor(20, 100), { width: 160, height: 200 }, viewport))
			.toEqual({ top: 134, left: 20, maxHeight: null });
	});

	it('lines up with the right edge for align "end"', () => {
		const place = placeMenu(anchor(300, 100), { width: 160, height: 200 }, viewport, 'end');
		expect(place.left).toBe(380 - 160);
	});

	it('clamps a menu that would run off either side of the viewport', () => {
		expect(placeMenu(anchor(350, 100), { width: 160, height: 100 }, viewport).left).toBe(400 - 160 - 8);
		expect(placeMenu(anchor(10, 100), { width: 160, height: 100 }, viewport, 'end').left).toBe(8);
	});

	it('flips above a trigger near the bottom when there is more room there', () => {
		const place = placeMenu(anchor(20, 700), { width: 160, height: 300 }, viewport);
		expect(place).toEqual({ top: 700 - 4 - 300, left: 20, maxHeight: null });
	});

	it('shrinks a menu that fits neither below nor above', () => {
		const place = placeMenu(anchor(20, 100), { width: 160, height: 900 }, viewport);
		// Below has 800 − 130 − 4 − 8 = 658 px, more than the 88 above, so it stays below.
		expect(place).toEqual({ top: 134, left: 20, maxHeight: 658 });
	});

	it('honours the gap', () => {
		expect(placeMenu(anchor(20, 100), { width: 160, height: 100 }, viewport, 'start', 6).top).toBe(136);
	});
});

describe('popoverId', () => {
	it('never repeats', () => {
		expect(popoverId('m')).not.toBe(popoverId('m'));
	});
});
