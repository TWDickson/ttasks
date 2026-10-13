/**
 * Per-device, per-vault state (PB-2): fired reminders, snoozes, the mobile
 * quick-create preference. Deliberately not synced — each device shows its own
 * reminders — so it lives in `localStorage`, but through Obsidian's
 * `app.loadLocalStorage` / `saveLocalStorage`, which namespace it to the vault.
 * That replaces hand-built `…-<vault name>` keys, which collided across vaults
 * that share a name and leaked one global key between vaults.
 *
 * Every access is guarded: storage can be unavailable or full, and losing a
 * fired-reminder record is better than throwing in the middle of a write.
 *
 * Pure module — no Obsidian imports (the app is injected).
 */

export interface DeviceStore {
	get<T>(key: string): T | null;
	/** `null` removes the entry. */
	set(key: string, value: unknown | null): void;
}

export interface VaultLocalStorage {
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown | null): void;
}

export const DEVICE_KEYS = {
	remindersFired: 'ttasks-reminders-fired',
	snoozed: 'ttasks-snoozed',
	mobileQuickCreate: 'ttasks-mobile-quick-create',
	mobileQuickCreateHintDismissed: 'ttasks-mobile-quick-create-hint-dismissed',
} as const;

export function createDeviceStore(app: VaultLocalStorage, onError: (message: string) => void = () => {}): DeviceStore {
	return {
		get<T>(key: string): T | null {
			try {
				return (app.loadLocalStorage(key) as T | null | undefined) ?? null;
			} catch (error) {
				onError(`device storage read failed for "${key}": ${String(error)}`);
				return null;
			}
		},
		set(key: string, value: unknown | null): void {
			try {
				app.saveLocalStorage(key, value);
			} catch (error) {
				onError(`device storage write failed for "${key}": ${String(error)}`);
			}
		},
	};
}

/** In-memory store for tests and the rig. */
export function createMemoryDeviceStore(seed: Record<string, unknown> = {}): DeviceStore & { dump(): Record<string, unknown> } {
	const data = new Map(Object.entries(seed));
	return {
		get: <T>(key: string) => (data.has(key) ? (data.get(key) as T) : null),
		set: (key, value) => { if (value === null) data.delete(key); else data.set(key, value); },
		dump: () => Object.fromEntries(data),
	};
}

interface RawStorage {
	getItem(key: string): string | null;
	removeItem(key: string): void;
}

const parseJson = (raw: string): unknown => {
	try { return JSON.parse(raw); } catch { return null; }
};

/**
 * One-time hand-off from the pre-PB-2 raw keys, so an upgrade doesn't re-fire
 * today's reminders, forget snoozes, or re-show a dismissed hint. Copies only into
 * empty slots, then removes the old key. Returns how many entries moved.
 *
 * Delete together with `Scripts/migrate-prefixed-schema.mjs` once every device
 * has run a PB-2 build.
 */
export function migrateLegacyDeviceStorage(raw: RawStorage, store: DeviceStore, vaultName: string): number {
	const moves: [string, string, (value: string) => unknown][] = [
		[`ttasks-reminders-fired-${vaultName}`, DEVICE_KEYS.remindersFired, parseJson],
		[`ttasks-snoozed-v1-${vaultName}`, DEVICE_KEYS.snoozed, parseJson],
		['ttasks.mobileQuickCreate', DEVICE_KEYS.mobileQuickCreate, (v) => v === '1'],
		['ttasks.mobileQuickCreateHintDismissed', DEVICE_KEYS.mobileQuickCreateHintDismissed, (v) => v === '1'],
	];
	let moved = 0;
	for (const [oldKey, newKey, convert] of moves) {
		let value: string | null;
		try { value = raw.getItem(oldKey); } catch { continue; }
		if (value === null) continue;
		const converted = convert(value);
		if (store.get(newKey) === null && converted !== null) {
			store.set(newKey, converted);
			moved++;
		}
		try { raw.removeItem(oldKey); } catch { /* best effort */ }
	}
	return moved;
}
