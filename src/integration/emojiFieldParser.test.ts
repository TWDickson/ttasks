import { describe, expect, it } from 'vitest';
import { parseEmojiFields } from './emojiFieldParser';

describe('parseEmojiFields', () => {
	it('parses due dates with the calendar emoji', () => {
		expect(parseEmojiFields('Task name 📅 2026-05-22')).toMatchObject({
			description: 'Task name',
			dueDate: '2026-05-22',
		});
	});

	it('parses scheduled dates as start dates', () => {
		expect(parseEmojiFields('Task name ⏳ 2026-05-22')).toMatchObject({
			startDate: '2026-05-22',
		});
	});

	it('prefers explicit start dates over scheduled dates', () => {
		expect(parseEmojiFields('Task name 🛫 2026-05-20 ⏳ 2026-05-22')).toMatchObject({
			startDate: '2026-05-20',
		});
	});

	it('maps highest priority aliases to High', () => {
		expect(parseEmojiFields('Task name ⏫')).toMatchObject({ priority: 'High' });
	});

	it('maps medium priority emoji', () => {
		expect(parseEmojiFields('Task name 🔼')).toMatchObject({ priority: 'Medium' });
	});

	it('maps low priority emoji', () => {
		expect(parseEmojiFields('Task name 🔽')).toMatchObject({ priority: 'Low' });
	});

	it('maps alternate high priority emoji', () => {
		expect(parseEmojiFields('Task name 🔺')).toMatchObject({ priority: 'High' });
	});

	it('maps alternate low priority emoji', () => {
		expect(parseEmojiFields('Task name ⏬')).toMatchObject({ priority: 'Low' });
	});

	it('defaults to None priority when no priority emoji is present', () => {
		expect(parseEmojiFields('Task name')).toMatchObject({ priority: 'None' });
	});

	it('accepts alternate due and scheduled aliases', () => {
		expect(parseEmojiFields('Task name 📆 2026-05-24 ⌛ 2026-05-22')).toMatchObject({
			dueDate: '2026-05-24',
			startDate: '2026-05-22',
		});
		expect(parseEmojiFields('Task name 🗓 2026-05-24')).toMatchObject({
			dueDate: '2026-05-24',
		});
	});

	it('accepts variation selector emoji forms', () => {
		expect(parseEmojiFields('Task name 📅️ 2026-05-22 🔁️ every week')).toMatchObject({
			dueDate: '2026-05-22',
			recurrence: 'every week',
		});
	});

	it('scrubs nbsp before emoji fields', () => {
		expect(parseEmojiFields('Task name\u00A0📅 2026-05-22')).toMatchObject({
			description: 'Task name',
			dueDate: '2026-05-22',
		});
	});

	it('marks cancelled tasks without setting completed date', () => {
		expect(parseEmojiFields('Task name ❌ 2026-05-22')).toMatchObject({
			cancelled: true,
			completedDate: null,
		});
	});

	it('preserves recurrence text verbatim', () => {
		expect(parseEmojiFields('Task name 🔁 every week')).toMatchObject({
			recurrence: 'every week',
		});
	});

	it('strips all known signifiers from the description', () => {
		expect(parseEmojiFields('Task name ➕ 2026-05-01 📅 2026-05-22 🔺')).toMatchObject({
			description: 'Task name',
			createdDate: '2026-05-01',
			dueDate: '2026-05-22',
			priority: 'High',
		});
	});

	it('returns the original description when no emoji fields are present', () => {
		expect(parseEmojiFields('Task name only')).toMatchObject({
			description: 'Task name only',
			dueDate: null,
			startDate: null,
			createdDate: null,
			completedDate: null,
			cancelled: false,
			recurrence: null,
			priority: 'None',
		});
	});
});