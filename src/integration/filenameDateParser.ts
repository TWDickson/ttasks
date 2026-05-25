export interface ParsedFilenameDates {
	startDate: string | null;
	dueDate: string | null;
}

const FILENAME_DATE_PATTERN = /\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/g;

export function parseDatesFromFilename(filename: string): ParsedFilenameDates {
	const matches = [...filename.matchAll(FILENAME_DATE_PATTERN)].map((match) => match[0]);

	return {
		startDate: matches[0] ?? null,
		dueDate: matches[1] ?? null,
	};
}