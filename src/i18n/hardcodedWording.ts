/**
 * Count the hard-coded UI wording in a source file — the ratchet behind
 * `hardcodedWording.test.ts`. A heuristic, not a parser: it looks for the
 * shapes UI text takes in this codebase and errs toward under-counting, because
 * its job is to stop *new* literals and list the files still to convert, not to
 * prove a file clean.
 *
 * Counted:
 * - `.svelte` markup — a text node with letters in it; a literal `aria-label`,
 *   `title`, `placeholder` or `alt`; a capitalised string literal inside a
 *   `{…}` expression (`{open ? 'Hide' : 'Show all'}`).
 * - script (`.ts`, and a `.svelte` `<script>`) — a string literal passed to
 *   `new Notice(`, `setTooltip(`, an Obsidian `Setting`/element text setter
 *   (`setName`, `setDesc`, `setText`, `setButtonText`, `setPlaceholder`,
 *   `setTitle`), or given as a `text:` / `title:` / `placeholder:` option
 *   (`createEl('span', { text: 'Done' })`).
 */

const SCRIPT_PATTERNS: RegExp[] = [
	/new Notice\(\s*['"`]/g,
	/setTooltip\([^,()]+,\s*['"`]/g,
	/\.(?:setName|setDesc|setText|setButtonText|setPlaceholder|setTitle)\(\s*['"`]/g,
	/\b(?:text|title|placeholder)\s*:\s*['"`][A-Za-z]/g,
];

const MARKUP_ATTRIBUTE = /\s(?:aria-label|title|placeholder|alt)="[^"{]*[A-Za-z][^"{]*"/g;
const EXPRESSION_LITERAL = /(['"`])[A-Z][a-z]+(?:[ ,’][^'"`]*)?\1/g;

function countScript(code: string): number {
	return SCRIPT_PATTERNS.reduce((sum, pattern) => sum + (code.match(pattern)?.length ?? 0), 0);
}

function countMarkup(markup: string): number {
	let count = markup.match(MARKUP_ATTRIBUTE)?.length ?? 0;

	// Pull out `{…}` expressions (innermost first, so nesting unwinds), counting
	// capitalised literals inside them; what's left is tags and text.
	let rest = markup;
	const expression = /\{[^{}]*\}/g;
	while (expression.test(rest)) {
		rest = rest.replace(expression, (match) => {
			count += match.match(EXPRESSION_LITERAL)?.length ?? 0;
			return ' ';
		});
	}
	for (const [, text] of rest.matchAll(/>([^<>]*)</g)) {
		if (/[A-Za-z]{2}/.test(text)) count += 1;
	}
	return count;
}

export function countHardcodedWording(path: string, source: string): number {
	if (!path.endsWith('.svelte')) return countScript(source);

	let scripts = 0;
	const markup = source
		.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/g, (_match, code: string) => {
			scripts += countScript(code);
			return '';
		})
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '');
	return scripts + countMarkup(markup);
}
