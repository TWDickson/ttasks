import { describe, expect, it, vi } from 'vitest';
import { dispatchProtocolAction, parseProtocolAction, type ProtocolDispatchDeps } from './protocol';

function makeDeps(): ProtocolDispatchDeps & {
	openBoard: ReturnType<typeof vi.fn>;
	openTask: ReturnType<typeof vi.fn>;
	createTask: ReturnType<typeof vi.fn>;
	createProject: ReturnType<typeof vi.fn>;
	runQuickAction: ReturnType<typeof vi.fn>;
	openJump: ReturnType<typeof vi.fn>;
	notice: ReturnType<typeof vi.fn>;
} {
	return {
		openBoard: vi.fn(async () => {}),
		openTask: vi.fn(async () => {}),
		createTask: vi.fn(async () => {}),
		createProject: vi.fn(async () => {}),
		runQuickAction: vi.fn(async () => true),
		openJump: vi.fn(async () => {}),
		notice: vi.fn(),
	};
}

describe('parseProtocolAction', () => {
	it('parses open action with path', () => {
		const parsed = parseProtocolAction({ action: 'open', path: 'Tasks/a.md' });
		expect(parsed).toEqual({ action: 'open', path: 'Tasks/a.md' });
	});

	it('defaults unknown action to open-board', () => {
		const parsed = parseProtocolAction({ action: 'unknown' });
		expect(parsed).toEqual({ action: 'open-board' });
	});

	it('normalizes quick action aliases', () => {
		expect(parseProtocolAction({ action: 'quick-complete', path: 'Tasks/a.md' })).toEqual({
			action: 'quick',
			quickAction: 'complete',
			path: 'Tasks/a.md',
		});
	});

	it('parses jump action with and without query', () => {
		expect(parseProtocolAction({ action: 'jump' })).toEqual({ action: 'jump' });
		expect(parseProtocolAction({ action: 'jump', query: 'roof' })).toEqual({ action: 'jump', query: 'roof' });
	});

	it('accepts search as an alias for jump', () => {
		expect(parseProtocolAction({ action: 'search', query: 'roof' })).toEqual({ action: 'jump', query: 'roof' });
	});

	it('treats blank jump query as absent', () => {
		expect(parseProtocolAction({ action: 'jump', query: '   ' })).toEqual({ action: 'jump' });
	});

	it('parses new-task prefill params', () => {
		expect(parseProtocolAction({ action: 'new-task', name: 'Fix roof', area: 'Home', due: '2026-07-10' })).toEqual({
			action: 'new-task',
			prefill: { name: 'Fix roof', area: 'Home', due_date: '2026-07-10' },
		});
	});

	it('accepts due_date as an alias for due', () => {
		expect(parseProtocolAction({ action: 'new-task', due_date: '2026-07-10' })).toEqual({
			action: 'new-task',
			prefill: { due_date: '2026-07-10' },
		});
	});

	it('ignores invalid due values and unknown params on new-task', () => {
		expect(parseProtocolAction({ action: 'new-task', due: 'next tuesday', bogus: 'x' })).toEqual({
			action: 'new-task',
		});
	});

	it('returns new-task without prefill when no prefill params given', () => {
		expect(parseProtocolAction({ action: 'new-task' })).toEqual({ action: 'new-task' });
	});
});

describe('dispatchProtocolAction', () => {
	it('opens board for open-board action', async () => {
		const deps = makeDeps();
		await dispatchProtocolAction(parseProtocolAction({ action: 'open-board' }), deps);
		expect(deps.openBoard).toHaveBeenCalledTimes(1);
	});

	it('opens task when path is provided', async () => {
		const deps = makeDeps();
		await dispatchProtocolAction(parseProtocolAction({ action: 'open', path: 'Tasks/a.md' }), deps);
		expect(deps.openTask).toHaveBeenCalledWith('Tasks/a.md');
	});

	it('creates task/project actions', async () => {
		const deps = makeDeps();
		await dispatchProtocolAction(parseProtocolAction({ action: 'new-task' }), deps);
		await dispatchProtocolAction(parseProtocolAction({ action: 'new-project' }), deps);
		expect(deps.createTask).toHaveBeenCalledWith(undefined);
		expect(deps.createProject).toHaveBeenCalledTimes(1);
	});

	it('passes prefill through to createTask', async () => {
		const deps = makeDeps();
		await dispatchProtocolAction(parseProtocolAction({ action: 'new-task', name: 'Fix roof', due: '2026-07-10' }), deps);
		expect(deps.createTask).toHaveBeenCalledWith({ name: 'Fix roof', due_date: '2026-07-10' });
	});

	it('opens the jump switcher with the query', async () => {
		const deps = makeDeps();
		await dispatchProtocolAction(parseProtocolAction({ action: 'jump', query: 'roof' }), deps);
		expect(deps.openJump).toHaveBeenCalledWith('roof');
	});

	it('opens the jump switcher without a query', async () => {
		const deps = makeDeps();
		await dispatchProtocolAction(parseProtocolAction({ action: 'jump' }), deps);
		expect(deps.openJump).toHaveBeenCalledWith(undefined);
	});

	it('runs quick actions when valid', async () => {
		const deps = makeDeps();
		await dispatchProtocolAction(parseProtocolAction({ action: 'quick-complete', path: 'Tasks/a.md' }), deps);
		expect(deps.runQuickAction).toHaveBeenCalledWith('complete', 'Tasks/a.md');
	});

	it('notices when required path is missing', async () => {
		const deps = makeDeps();
		await dispatchProtocolAction(parseProtocolAction({ action: 'quick-complete' }), deps);
		expect(deps.notice).toHaveBeenCalledWith('TTasks: missing required path.');
	});
});
