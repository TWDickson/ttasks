import type { TaskPriority } from '../types';

export interface ParsedEmojiFields {
	description: string;
	priority: TaskPriority;
	dueDate: string | null;
	startDate: string | null;
	createdDate: string | null;
	completedDate: string | null;
	cancelled: boolean;
	recurrence: string | null;
}

const ISO_DATE_PATTERN = '(\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01]))';

type ParserState = Omit<ParsedEmojiFields, 'description'>;
type TailParser = {
	parse: (text: string, state: ParserState) => { text: string; matched: boolean };
};

function escapeEmoji(emoji: string): string {
	return `${emoji}\\uFE0F?`;
}

function createDateTailParser(
	emojis: string[],
	apply: (state: ParserState, value: string) => void,
): TailParser {
	const pattern = new RegExp(`(?:\\s|\\u00A0)+(?:${emojis.map(escapeEmoji).join('|')})\\s*${ISO_DATE_PATTERN}$`, 'u');

	return {
		parse(text, state) {
			const match = text.match(pattern);
			if (!match) {
				return { text, matched: false };
			}

			apply(state, match[1]);
			return { text: text.slice(0, match.index).trimEnd(), matched: true };
		},
	};
}

function createPriorityTailParser(emojis: string[], priority: TaskPriority): TailParser {
	const pattern = new RegExp(`(?:\\s|\\u00A0)+(?:${emojis.map(escapeEmoji).join('|')})$`, 'u');

	return {
		parse(text, state) {
			const match = text.match(pattern);
			if (!match) {
				return { text, matched: false };
			}

			if (state.priority === 'None') {
				state.priority = priority;
			}
			return { text: text.slice(0, match.index).trimEnd(), matched: true };
		},
	};
}

const tailParsers: TailParser[] = [
	{
		parse(text, state) {
			const match = text.match(/(?:\s|\u00A0)+(?:🔁\uFE0F?)\s*(.+)$/u);
			if (!match) {
				return { text, matched: false };
			}

			if (state.recurrence == null) {
				state.recurrence = match[1].trim();
			}
			return { text: text.slice(0, match.index).trimEnd(), matched: true };
		},
	},
	createDateTailParser(['❌'], (state) => {
		state.cancelled = true;
	}),
	createDateTailParser(['✅'], (state, value) => {
		state.completedDate = value;
	}),
	createDateTailParser(['➕'], (state, value) => {
		state.createdDate = value;
	}),
	createDateTailParser(['🛫'], (state, value) => {
		state.startDate = value;
	}),
	createDateTailParser(['⏳', '⌛'], (state, value) => {
		if (!state.startDate) {
			state.startDate = value;
		}
	}),
	createDateTailParser(['📅', '📆', '🗓'], (state, value) => {
		state.dueDate = value;
	}),
	createPriorityTailParser(['🔺', '⏫'], 'High'),
	createPriorityTailParser(['🔼'], 'Medium'),
	createPriorityTailParser(['🔽', '⏬'], 'Low'),
];

export function parseEmojiFields(text: string): ParsedEmojiFields {
	const state: ParserState = {
		priority: 'None',
		dueDate: null,
		startDate: null,
		createdDate: null,
		completedDate: null,
		cancelled: false,
		recurrence: null,
	};

	let working = text.replace(/\u00A0/g, ' ').trim();

	while (working.length > 0) {
		let matched = false;
		for (const parser of tailParsers) {
			const result = parser.parse(working, state);
			if (!result.matched) {
				continue;
			}

			working = result.text;
			matched = true;
			break;
		}

		if (!matched) {
			break;
		}
	}

	return {
		description: working.trim(),
		...state,
	};
}