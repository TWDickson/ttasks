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
 *
 * The second source of type drift is Obsidian's *native property types*. A user
 * can set any property to Text / List / Number / Checkbox / Date in the
 * Properties UI, and Obsidian then rewrites that field across the vault into the
 * chosen shape — so a scalar field can arrive as a one-element list (`area:
 * [Work]`) and a list field can arrive as a bare scalar (`labels: feature`).
 * `toFrontmatterScalar` / `toFrontmatterStringArray` absorb both directions.
 */

/**
 * Unwrap a value that Obsidian's List property type turned into an array.
 * A one-element array yields its element; a longer array yields its first
 * element (the rest are unrepresentable in a scalar field); anything else is
 * returned unchanged. Empty arrays become undefined so callers fall back.
 */
export function toFrontmatterScalar(value: unknown): unknown {
	if (!Array.isArray(value)) return value;
	return value.length > 0 ? value[0] : undefined;
}

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

/**
 * Coerce a frontmatter value into a string array. An array is coerced
 * element-by-element (dropping entries that reduce to nothing); a bare scalar
 * becomes a one-element array, which is what a list field looks like once the
 * user retypes it to Text in Obsidian's property settings. Null, undefined, and
 * empty strings become `[]`.
 */
export function toFrontmatterStringArray(value: unknown): string[] {
	const raw = Array.isArray(value) ? value : [value];
	const out: string[] = [];
	for (const entry of raw) {
		if (entry === null || entry === undefined) continue;
		const coerced = toFrontmatterString(entry);
		if (coerced !== '') out.push(coerced);
	}
	return out;
}

/**
 * Coerce a frontmatter value into a boolean. Real booleans pass through; the
 * string and numeric spellings a Text- or Number-typed property produces
 * (`"true"` / `"yes"` / `1`) are recognised too. Anything else — including an
 * absent value — yields `fallback`.
 */
export function toFrontmatterBoolean(value: unknown, fallback = false): boolean {
	const scalar = toFrontmatterScalar(value);
	if (typeof scalar === 'boolean') return scalar;
	if (typeof scalar === 'number') return scalar !== 0;
	if (typeof scalar === 'string') {
		const normalized = scalar.trim().toLowerCase();
		if (normalized === 'true' || normalized === 'yes' || normalized === '1') return true;
		if (normalized === 'false' || normalized === 'no' || normalized === '0') return false;
	}
	return fallback;
}

/**
 * Coerce a frontmatter value into a non-empty string, or null. Used for the
 * optional string fields whose "absent" state the Task model spells as null.
 */
export function toFrontmatterStringOrNull(value: unknown): string | null {
	const coerced = toFrontmatterString(toFrontmatterScalar(value));
	return coerced === '' ? null : coerced;
}

/**
 * Resolve a frontmatter value against a closed set of allowed values, or null
 * when it matches none. Matching is exact first, then case-/whitespace-
 * insensitive, so a hand-edited `priority: high` still lands on `High` instead
 * of silently falling back. List-typed values are unwrapped.
 */
export function toFrontmatterOptionalEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
): T | null {
	const raw = toFrontmatterString(toFrontmatterScalar(value));
	if (raw === '') return null;
	const exact = allowed.find((option) => option === raw);
	if (exact !== undefined) return exact;
	const normalized = raw.trim().toLowerCase();
	return allowed.find((option) => option.trim().toLowerCase() === normalized) ?? null;
}

/**
 * Like `toFrontmatterOptionalEnum`, but substitutes `fallback` for an
 * unrecognised value instead of null.
 */
export function toFrontmatterEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
	fallback: T,
): T {
	return toFrontmatterOptionalEnum(value, allowed) ?? fallback;
}
