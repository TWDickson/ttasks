/**
 * Plugin-facing half of the CLI: registers `CLI_COMMANDS` with Obsidian's
 * command-line interface (`obsidian ttasks:list …`).
 *
 * `registerCliHandler` arrived in Obsidian 1.12.2 and is desktop-only, but our
 * `minAppVersion` is 1.8.7, so on an older app or on mobile the method simply
 * isn't there. Registration checks for it and does nothing without it, so the
 * plugin still loads where the CLI can't exist.
 */
import type { CliData, CliFlags, Plugin } from 'obsidian';
import { CLI_COMMANDS, type CliActions, type CliContext } from './cliCommands';

type CliRegistrar = (command: string, description: string, flags: CliFlags | null, handler: (params: CliData) => string | Promise<string>) => void;

export interface CliHost {
	/** A fresh snapshot of the plugin state, built per invocation. */
	cliContext(): CliContext;
	/** The side effects navigation and write commands cause. */
	cliActions(): CliActions;
	/** Non-null while the store can't be trusted (an unconverted vault): returned as the error. */
	cliUnavailableReason(): string | null;
}

const errorOutput = (message: string): string => JSON.stringify({ error: message }, null, 2);

/** Whether this Obsidian build has a CLI to register with. */
export function canRegisterCli(plugin: Plugin): boolean {
	return typeof (plugin as unknown as { registerCliHandler?: unknown }).registerCliHandler === 'function';
}

export function registerCliCommands(plugin: Plugin, host: CliHost): boolean {
	if (!canRegisterCli(plugin)) return false;
	const register = (plugin as unknown as { registerCliHandler: CliRegistrar }).registerCliHandler.bind(plugin);
	for (const command of CLI_COMMANDS) {
		register(command.id, command.description, command.flags, async (params) => {
			const unavailable = host.cliUnavailableReason();
			if (unavailable) return errorOutput(unavailable);
			try {
				return await command.run(params, host.cliContext(), host.cliActions());
			} catch (error) {
				// What the CLI does with a thrown error isn't documented, and a write
				// failing (a full disk, a write that didn't land) is exactly when the
				// caller needs a readable answer. So it is printed like any other error.
				return errorOutput(error instanceof Error ? error.message : String(error));
			}
		});
	}
	return true;
}
