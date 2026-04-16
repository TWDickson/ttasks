export interface TriggerMatch {
	start: number;
	end: number;
	query: string;
}

const DEFAULT_TOKEN = '@task';

export function findTaskTrigger(lineText: string, cursorCh: number, token: string = DEFAULT_TOKEN): TriggerMatch | null {
	const effectiveToken = token.trim() || DEFAULT_TOKEN;
	const upto = lineText.slice(0, cursorCh);
	const idx = upto.lastIndexOf(effectiveToken);
	if (idx < 0) return null;
	const before = idx === 0 ? ' ' : upto[idx - 1] ?? ' ';
	if (!/\s|[([{-]/.test(before)) return null;
	const raw = upto.slice(idx + effectiveToken.length);
	if (raw.length > 0 && !raw.startsWith(' ')) return null;
	return {
		start: idx,
		end: cursorCh,
		query: raw.trimStart(),
	};
}
