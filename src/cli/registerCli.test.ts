import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { canRegisterCli, registerCliCommands, type CliHost } from './registerCli';
import { CLI_COMMANDS } from './cliCommands';

const host = (reason: string | null = null): CliHost => ({
	cliContext: vi.fn(() => { throw new Error('context should not be built'); }),
	cliUnavailableReason: () => reason,
});

describe('registerCliCommands', () => {
	it('does nothing where Obsidian has no CLI (below 1.12.2, or mobile)', () => {
		const plugin = {} as Plugin;
		expect(canRegisterCli(plugin)).toBe(false);
		expect(registerCliCommands(plugin, host())).toBe(false);
	});

	it('registers every command with its flags', () => {
		const registerCliHandler = vi.fn();
		const plugin = { registerCliHandler } as unknown as Plugin;
		expect(registerCliCommands(plugin, host())).toBe(true);
		expect(registerCliHandler.mock.calls.map((call) => call[0])).toEqual(CLI_COMMANDS.map((command) => command.id));
		expect(registerCliHandler.mock.calls[0][2]).toHaveProperty('format');
	});

	it('answers with the reason, without reading the store, while it cannot be trusted', () => {
		const registerCliHandler = vi.fn();
		const blocked = host('vault not converted');
		registerCliCommands({ registerCliHandler } as unknown as Plugin, blocked);
		const handler = registerCliHandler.mock.calls[0][3] as (params: Record<string, string>) => string;
		expect(JSON.parse(handler({}))).toEqual({ error: 'vault not converted' });
		expect(blocked.cliContext).not.toHaveBeenCalled();
	});
});
