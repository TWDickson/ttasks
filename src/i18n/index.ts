/**
 * `t()` — look up a UI string by key and fill its `{placeholders}`.
 *
 *     t('filter.clear', { label: 'status' })   // "Clear status"
 *     t('graph.projectFilter.showAll')          // "Show all"
 *
 * Keys and parameters are checked at compile time against `en.ts`, which is the
 * source of truth: a typo'd key, a missing parameter, or a parameter the message
 * doesn't name all fail `tsc`. Pure — no Obsidian import; the plugin calls
 * `setLocale(getLanguage())` once on load.
 *
 * Only English ships today. A new language is a file shaped like `Messages`
 * (so the compiler lists anything it's missing) added to `CATALOGS`.
 */
import { en } from './en';

/** The catalogue shape, with every message widened from its literal to `string`. */
export type Messages = Widen<typeof en>;
type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** Every dotted path to a message: `'filter.clear'`, `'graph.projectFilter.pill'`, … */
export type MessageKey = Leaves<typeof en>;
type Leaves<T, Prefix extends string = ''> = {
	[K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

type MessageAt<T, K extends string> = K extends `${infer Head}.${infer Rest}`
	? Head extends keyof T ? MessageAt<T[Head], Rest> : never
	: K extends keyof T ? T[K] : never;

/** The `{name}` placeholders in a message literal, as a union of names. */
type Placeholders<S> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

export type MessageParams<K extends MessageKey> = Record<Placeholders<MessageAt<typeof en, K>>, string | number>;

/** A parameter object only when the message has placeholders — none otherwise. */
type ParamArgs<K extends MessageKey> = [Placeholders<MessageAt<typeof en, K>>] extends [never]
	? []
	: [params: MessageParams<K>];

const CATALOGS: Readonly<Record<string, Messages>> = { en };

let active: Messages = en;

/**
 * Pick the catalogue for an Obsidian language code (`getLanguage()`: `en`,
 * `de`, `zh-TW`, …). Tries the exact code, then its base language, then English.
 */
export function setLocale(language: string): void {
	const base = language.split('-')[0];
	active = CATALOGS[language] ?? CATALOGS[base] ?? en;
}

export function t<K extends MessageKey>(key: K, ...args: ParamArgs<K>): string {
	const message = lookup(active, key) ?? lookup(en, key) ?? key;
	const params = args[0] as Record<string, string | number> | undefined;
	if (!params) return message;
	return message.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match);
}

function lookup(catalog: Messages, key: string): string | undefined {
	let node: unknown = catalog;
	for (const part of key.split('.')) {
		if (typeof node !== 'object' || node === null) return undefined;
		node = (node as Record<string, unknown>)[part];
	}
	return typeof node === 'string' ? node : undefined;
}
