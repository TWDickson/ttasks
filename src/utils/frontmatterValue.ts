/**
 * Coercion helpers for the frontmatter → Task boundary.
 *
 * Frontmatter is decoded by a YAML parser (Obsidian's metadata cache), so a
 * field's runtime type is whatever YAML inferred — not what the schema intends.
 * A bare `123` is a number, `true` is a boolean, and an unquoted `2026-07-20`
 * is a *timestamp* (a Date), even when the app only ever wants a string. Worse,
 * Obsidian's `processFrontMatter` re-dumps values unquoted, so fields we wrote
 * as strings can come back a different type after any later mutation.
 *
 * These helpers pin each value to the type the Task model expects, so downstream
 * code (sorting, matching, rendering, arithmetic) never has to defend itself.
 * Date-only fields have their own coercion in `dateUtils.toCalendarDate`.
 */

/**
 * Coerce a frontmatter value into a string. Primitive scalars (number, boolean,
 * bigint) are stringified so a numeric-looking title like `name: 2026` still
 * renders and sorts as text; a `Date` becomes its calendar-date portion. Null,
 * undefined, and non-scalar values fall back to `fallback` (default `''`).
 */
export function toFrontmatterString(value: unknown, fallback = ''): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? fallback : value.toISOString().slice(0, 10);
	}
	return fallback;
}

/**
 * Coerce a frontmatter value into a finite number, or null. Accepts a real
 * number or a numeric string (`estimated_days: "3"` when the user quoted it);
 * everything else — including NaN, Infinity, booleans, and Dates — becomes null.
 */
export function toFrontmatterNumber(value: unknown): number | null {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}
