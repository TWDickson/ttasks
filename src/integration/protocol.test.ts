import { describe, expect, it, vi } from 'vitest';
import { dispatchProtocolAction, parseProtocolAction } from './protocol';

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
});

describe('dispatchProtocolAction', () => {
	it('opens board for open-board action', async () => {
		const deps = {
			openBoard: vi.fn(async () => {}),
			openTask: vi.fn(async () => {}),
			createTask: vi.fn(async () => {}),
			createProject: vi.fn(async () => {}),
			runQuickAction: vi.fn(async () => true),
			notice: vi.fn(),
		};

		await dispatchProtocolAction(parseProtocolAction({ action: 'open-board' }), deps);
		expect(deps.openBoard).toHaveBeenCalledTimes(1);
	});

	it('opens task when path is provided', async () => {
		const deps = {
			openBoard: vi.fn(async () => {}),
			openTask: vi.fn(async () => {}),
			createTask: vi.fn(async () => {}),
			createProject: vi.fn(async () => {}),
			runQuickAction: vi.fn(async () => true),
			notice: vi.fn(),
		};

		await dispatchProtocolAction(parseProtocolAction({ action: 'open', path: 'Tasks/a.md' }), deps);
		expect(deps.openTask).toHaveBeenCalledWith('Tasks/a.md');
	});

	it('creates task/project actions', async () => {
		const deps = {
			openBoard: vi.fn(async () => {}),
			openTask: vi.fn(async () => {}),
			createTask: vi.fn(async () => {}),
			createProject: vi.fn(async () => {}),
			runQuickAction: vi.fn(async () => true),
			notice: vi.fn(),
		};

		await dispatchProtocolAction(parseProtocolAction({ action: 'new-task' }), deps);
		await dispatchProtocolAction(parseProtocolAction({ action: 'new-project' }), deps);
		expect(deps.createTask).toHaveBeenCalledTimes(1);
		expect(deps.createProject).toHaveBeenCalledTimes(1);
	});

	it('runs quick actions when valid', async () => {
		const deps = {
			openBoard: vi.fn(async () => {}),
			openTask: vi.fn(async () => {}),
			createTask: vi.fn(async () => {}),
			createProject: vi.fn(async () => {}),
			runQuickAction: vi.fn(async () => true),
			notice: vi.fn(),
		};

		await dispatchProtocolAction(parseProtocolAction({ action: 'quick-complete', path: 'Tasks/a.md' }), deps);
		expect(deps.runQuickAction).toHaveBeenCalledWith('complete', 'Tasks/a.md');
	});

	it('notices when required path is missing', async () => {
		const deps = {
			openBoard: vi.fn(async () => {}),
			openTask: vi.fn(async () => {}),
			createTask: vi.fn(async () => {}),
			createProject: vi.fn(async () => {}),
			runQuickAction: vi.fn(async () => true),
			notice: vi.fn(),
		};

		await dispatchProtocolAction(parseProtocolAction({ action: 'quick-complete' }), deps);
		expect(deps.notice).toHaveBeenCalledWith('TTasks: missing required path.');
	});
});
