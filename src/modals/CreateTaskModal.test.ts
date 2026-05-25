import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import { App } from 'obsidian';
import type TTasksPlugin from '../main';
import type { Task } from '../types';
import { CreateTaskModal } from './CreateTaskModal';

class FakeStyle {
	[key: string]: unknown;
	removeProperty(name: string): void {
		delete this[name];
	}
}

class FakeElement {
	tag: string;
	textContent = '';
	innerHTML = '';
	value = '';
	checked = false;
	disabled = false;
	parent: FakeElement | null = null;
	children: FakeElement[] = [];
	classNames = new Set<string>();
	attributes = new Map<string, string>();
	listeners = new Map<string, Array<(event?: any) => void | Promise<void>>>();
	style = new FakeStyle();

	constructor(tag: string, cls?: string) {
		this.tag = tag;
		if (cls) {
			for (const name of cls.split(/\s+/).filter(Boolean)) {
				this.classNames.add(name);
			}
		}
	}

	createEl(tag: string, options?: { text?: string; cls?: string; attr?: Record<string, string> }): FakeElement {
		const child = new FakeElement(tag, options?.cls);
		child.parent = this;
		if (options?.text) child.textContent = options.text;
		if (options?.attr) {
			for (const [key, val] of Object.entries(options.attr)) {
				child.setAttribute(key, val);
			}
		}
		this.children.push(child);
		return child;
	}

	createDiv(options?: string | { cls?: string }): FakeElement {
		const cls = typeof options === 'string' ? options : options?.cls;
		return this.createEl('div', { cls });
	}

	createSpan(options?: { text?: string; cls?: string }): FakeElement {
		return this.createEl('span', { text: options?.text, cls: options?.cls });
	}

	addEventListener(type: string, handler: (event?: any) => void | Promise<void>): void {
		const existing = this.listeners.get(type) ?? [];
		existing.push(handler);
		this.listeners.set(type, existing);
	}

	async trigger(type: string, event: Record<string, unknown> = {}): Promise<void> {
		const payload = {
			target: this,
			currentTarget: this,
			...event,
		};
		for (const handler of this.listeners.get(type) ?? []) {
			await handler(payload);
		}
	}

	setText(text: string): void {
		this.textContent = text;
	}

	empty(): void {
		this.children = [];
		this.textContent = '';
		this.innerHTML = '';
	}

	focus(): void {}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
		if (name === 'value') this.value = value;
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	addClass(name: string): void {
		this.classNames.add(name);
	}

	removeClass(name: string): void {
		this.classNames.delete(name);
	}

	toggleClass(name: string, force?: boolean): void {
		if (force === undefined) {
			if (this.classNames.has(name)) this.classNames.delete(name);
			else this.classNames.add(name);
			return;
		}
		if (force) this.classNames.add(name);
		else this.classNames.delete(name);
	}

	hasClass(name: string): boolean {
		return this.classNames.has(name);
	}

	closest(selector: string): FakeElement | null {
		if (!selector.startsWith('.')) return null;
		const className = selector.slice(1);
		let current: FakeElement | null = this;
		while (current) {
			if (current.hasClass(className)) return current;
			current = current.parent;
		}
		return null;
	}

	remove(): void {
		if (!this.parent) return;
		this.parent.children = this.parent.children.filter((child) => child !== this);
		this.parent = null;
	}

	querySelector(selector: string): FakeElement | null {
		return this.querySelectorAll(selector)[0] ?? null;
	}

	querySelectorAll(selector: string): FakeElement[] {
		const matches: FakeElement[] = [];
		const matcher = (el: FakeElement): boolean => {
			if (selector.startsWith('.')) return el.hasClass(selector.slice(1));
			return el.tag === selector;
		};

		const visit = (el: FakeElement): void => {
			if (matcher(el)) matches.push(el);
			for (const child of el.children) visit(child);
		};

		for (const child of this.children) visit(child);
		return matches;
	}

	findByText(text: string): FakeElement | null {
		if (this.textContent === text) return this;
		for (const child of this.children) {
			const match = child.findByText(text);
			if (match) return match;
		}
		return null;
	}
}

function flushPromises(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function setupGlobals(isMobile = false): void {
	const storage = new Map<string, string>();
	(globalThis as any).localStorage = {
		getItem: (key: string) => storage.get(key) ?? null,
		setItem: (key: string, value: string) => {
			storage.set(key, value);
		},
	};
	(globalThis as any).window = {
		matchMedia: () => ({ matches: isMobile }),
	};
	(globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => {
		cb(0);
		return 1;
	};
	(globalThis as any).cancelAnimationFrame = () => {};
}

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'abc123',
		slug: 'task',
		path: 'Planner/Tasks/abc123-task.md',
		type: 'task',
		name: 'Task',
		area: null,
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: '',
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: '2026-05-20',
		completed: null,
		status_changed: '2026-05-20',
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: false,
		...overrides,
	};
}

function buildPluginMock(allTasks: Task[] = []) {
	const create = vi.fn().mockResolvedValue({ path: 'Planner/Tasks/new-task.md' });
	const openDetail = vi.fn().mockResolvedValue(undefined);
	return {
		settings: {
			tasksFolder: 'Planner/Tasks',
			statuses: ['Active', 'In Progress', 'Done'],
			areas: ['Work', 'Personal'],
			labelValues: ['feature', 'bug'],
			statusColors: { Active: '#3b82f6', 'In Progress': '#f59e0b', Done: '#10b981' },
			areaColors: { Work: '#3b82f6', Personal: '#8b5cf6' },
			labelColors: { feature: '#3b82f6', bug: '#ef4444' },
		},
		manifest: { id: 'ttasks' },
		taskStore: { tasks: writable(allTasks), create, openDetail, getByPath: (path: string) => allTasks.find((task) => task.path === path) ?? null },
	} as unknown as TTasksPlugin;
}

function buildModal(allTasks: Task[] = [], options?: { initialDependsOn?: string[]; mobile?: boolean }) {
	setupGlobals(options?.mobile ?? false);

	const plugin = buildPluginMock(allTasks);
	const { create, openDetail } = (plugin as any).taskStore;

	const modal = new CreateTaskModal(new App(), plugin, 'task', options);
	const contentEl = new FakeElement('div');
	const modalEl = new FakeElement('div');
	(modal as any).contentEl = contentEl;
	(modal as any).modalEl = modalEl;

	modal.onOpen();

	return { modal, contentEl, create, openDetail };
}

function findInputByClass(root: FakeElement, className: string, index = 0): FakeElement {
	const all = root.querySelectorAll(`.${className}`);
	const found = all[index];
	if (!found) throw new Error(`Expected .${className} at index ${index}`);
	return found;
}

function findButtonByText(root: FakeElement, text: string): FakeElement {
	const found = root.findByText(text);
	if (!found) throw new Error(`Expected button with text ${text}`);
	return found;
}

function findSelectContainingOption(root: FakeElement, optionText: string): FakeElement {
	const selects = root.querySelectorAll('select');
	const found = selects.find((select) => select.querySelectorAll('option').some((opt) => opt.textContent === optionText));
	if (!found) throw new Error(`Expected select containing option ${optionText}`);
	return found;
}

describe('CreateTaskModal DOM behavior', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('renders status and priority chip groups with expected active defaults', () => {
		const { contentEl } = buildModal();
		const chipGroups = contentEl.querySelectorAll('.tt-modal-chips');

		expect(chipGroups.length).toBeGreaterThanOrEqual(2);

		const statusActive = chipGroups[0].querySelector('.tt-chip-active');
		const priorityActive = chipGroups[1].querySelector('.tt-chip-active');
		expect(statusActive?.textContent).toBe('Active');
		expect(priorityActive?.textContent).toBe('None');
	});

	it('updates active state when status and priority chips are clicked', async () => {
		const { contentEl } = buildModal();
		const chipGroups = contentEl.querySelectorAll('.tt-modal-chips');
		const statusDone = findButtonByText(chipGroups[0], 'Done');
		const priorityHigh = findButtonByText(chipGroups[1], 'High');

		await statusDone.trigger('click');
		await priorityHigh.trigger('click');

		expect(chipGroups[0].querySelector('.tt-chip-active')?.textContent).toBe('Done');
		expect(chipGroups[1].querySelector('.tt-chip-active')?.textContent).toBe('High');
	});

	it('submits create payload with chip selections and opens detail', async () => {
		const { contentEl, create, openDetail } = buildModal();
		const chipGroups = contentEl.querySelectorAll('.tt-modal-chips');
		const nameInput = findInputByClass(contentEl, 'tt-modal-name');
		const createBtn = findInputByClass(contentEl, 'tt-modal-btn-primary');

		nameInput.value = 'Ship modal tests';
		await nameInput.trigger('input');
		await findButtonByText(chipGroups[0], 'In Progress').trigger('click');
		await findButtonByText(chipGroups[1], 'Medium').trigger('click');
		await createBtn.trigger('click');
		await flushPromises();

		expect(create).toHaveBeenCalledTimes(1);
		expect(create).toHaveBeenCalledWith(expect.objectContaining({
			name: 'Ship modal tests',
			status: 'In Progress',
			priority: 'Medium',
			type: 'task',
		}));
		expect(openDetail).toHaveBeenCalledWith('Planner/Tasks/new-task.md');
	});

	it('enforces due-date vs estimated-days exclusivity in submit payload', async () => {
		const { contentEl, create } = buildModal();
		const nameInput = findInputByClass(contentEl, 'tt-modal-name');
		const createBtn = findInputByClass(contentEl, 'tt-modal-btn-primary');
		const dateInputs = contentEl.querySelectorAll('input').filter((el) => el.getAttribute('type') === 'date');
		const dueDateInput = dateInputs[1];
		const estDaysInput = contentEl.querySelectorAll('input').find((el) => el.getAttribute('type') === 'number');
		if (!dueDateInput || !estDaysInput) throw new Error('Expected due date and est days inputs');

		dueDateInput.value = '2026-05-31';
		await dueDateInput.trigger('change');
		expect(estDaysInput.disabled).toBe(true);

		nameInput.value = 'Due date wins';
		await nameInput.trigger('input');
		await createBtn.trigger('click');
		await flushPromises();

		expect(create).toHaveBeenCalledWith(expect.objectContaining({
			due_date: '2026-05-31',
			estimated_days: null,
		}));
	});

	it('disables start date when dependency is selected and submits with null start_date', async () => {
		const dependency = makeTask({ path: 'Planner/Tasks/dep123-blocker.md', name: 'Blocker Task' });
		const { contentEl, create } = buildModal([dependency]);
		const nameInput = findInputByClass(contentEl, 'tt-modal-name');
		const createBtn = findInputByClass(contentEl, 'tt-modal-btn-primary');
		const dateInputs = contentEl.querySelectorAll('input').filter((el) => el.getAttribute('type') === 'date');
		const startDateInput = dateInputs[0];
		if (!startDateInput) throw new Error('Expected start date input');

		const dependencySelect = findSelectContainingOption(contentEl, '+ Add dependency…');
		dependencySelect.value = 'Planner/Tasks/dep123-blocker';
		await dependencySelect.trigger('change');

		expect(startDateInput.disabled).toBe(true);

		nameInput.value = 'Dependency flow';
		await nameInput.trigger('input');
		await createBtn.trigger('click');
		await flushPromises();

		expect(create).toHaveBeenCalledWith(expect.objectContaining({
			depends_on: ['Planner/Tasks/dep123-blocker'],
			start_date: null,
		}));
	});

	it('updates create button label and task-specific field state when switching to project', async () => {
		const { contentEl } = buildModal();
		const projectBtn = findButtonByText(contentEl, 'Project');
		const createBtn = findInputByClass(contentEl, 'tt-modal-btn-primary');
		const labelsLabel = findButtonByText(contentEl, 'Labels');
		const labelsField = labelsLabel.closest('.tt-modal-field');
		if (!labelsField) throw new Error('Expected labels field container');

		await projectBtn.trigger('click');

		expect(createBtn.textContent).toBe('Create project');
		expect(labelsField.style.opacity).toBe('0.35');
		expect(labelsField.style.pointerEvents).toBe('none');

	});
});

describe('CreateTaskModal mobile quick-create mode', () => {
		beforeEach(() => {
			vi.restoreAllMocks();
		});

		it('hides secondary fields when quick-create is enabled by default', () => {
			const { contentEl } = buildModal([], { mobile: true });

			const labelsLabel = findButtonByText(contentEl, 'Labels');
			const labelsField = labelsLabel?.closest('.tt-modal-field');
			if (!labelsField) throw new Error('Expected labels field container');

			const priorityLabel = findButtonByText(contentEl, 'Priority');
			const priorityField = priorityLabel?.closest('.tt-modal-field');
			if (!priorityField) throw new Error('Expected priority field container');

			const sections = contentEl.querySelectorAll('.tt-modal-section');
			const schedulingSection = sections.find((s) => s.findByText('Scheduling') !== null);
			const notesSection = sections.find((s) => s.findByText('Notes') !== null);
			const recurrenceSection = sections.find((s) => s.findByText('Repeats') !== null);

			expect(labelsField.hasClass('tt-hidden')).toBe(true);
			expect(priorityField.hasClass('tt-hidden')).toBe(true);
			expect(schedulingSection?.hasClass('tt-hidden')).toBe(true);
			expect(notesSection?.hasClass('tt-hidden')).toBe(true);
			expect(recurrenceSection?.hasClass('tt-hidden')).toBe(true);
		});

		it('toggle button carries tt-chip-active and correct label when quick-create is on', () => {
			const { contentEl } = buildModal([], { mobile: true });

			const toggleBtn = contentEl.querySelectorAll('.tt-modal-quick-toggle')[0];
			if (!toggleBtn) throw new Error('Expected .tt-modal-quick-toggle button');

			expect(toggleBtn.hasClass('tt-chip-active')).toBe(true);
			expect(toggleBtn.textContent).toBe('Quick create on');
		});

		it('restores fields when toggle is clicked to disable quick-create', async () => {
			const { contentEl } = buildModal([], { mobile: true });

			const toggleBtn = contentEl.querySelectorAll('.tt-modal-quick-toggle')[0];
			if (!toggleBtn) throw new Error('Expected .tt-modal-quick-toggle button');

			await toggleBtn.trigger('click');

			const labelsLabel = findButtonByText(contentEl, 'Labels');
			const labelsField = labelsLabel?.closest('.tt-modal-field');
			const priorityLabel = findButtonByText(contentEl, 'Priority');
			const priorityField = priorityLabel?.closest('.tt-modal-field');
			const sections = contentEl.querySelectorAll('.tt-modal-section');
			const schedulingSection = sections.find((s) => s.findByText('Scheduling') !== null);

			expect(labelsField?.hasClass('tt-hidden')).toBe(false);
			expect(priorityField?.hasClass('tt-hidden')).toBe(false);
			expect(schedulingSection?.hasClass('tt-hidden')).toBe(false);
			expect(toggleBtn.hasClass('tt-chip-active')).toBe(false);
			expect(toggleBtn.textContent).toBe('Quick create off');
		});

		it('persists quick-create preference to localStorage on each toggle', async () => {
			const { contentEl } = buildModal([], { mobile: true });
			// Default: ON → initial applyQuickMode(true) already persisted '1'
			expect(localStorage.getItem('ttasks.mobileQuickCreate')).toBe('1');

			const toggleBtn = contentEl.querySelectorAll('.tt-modal-quick-toggle')[0];
			if (!toggleBtn) throw new Error('Expected .tt-modal-quick-toggle button');

			await toggleBtn.trigger('click');
			expect(localStorage.getItem('ttasks.mobileQuickCreate')).toBe('0');

			await toggleBtn.trigger('click');
			expect(localStorage.getItem('ttasks.mobileQuickCreate')).toBe('1');
		});

		it('starts with quick-create OFF when saved preference is 0', () => {
			setupGlobals(true);
			localStorage.setItem('ttasks.mobileQuickCreate', '0');

			const plugin = buildPluginMock();
			const modal = new CreateTaskModal(new App(), plugin, 'task');
			const contentEl = new FakeElement('div');
			const modalEl = new FakeElement('div');
			(modal as any).contentEl = contentEl;
			(modal as any).modalEl = modalEl;
			modal.onOpen();

			const toggleBtn = contentEl.querySelectorAll('.tt-modal-quick-toggle')[0];
			if (!toggleBtn) throw new Error('Expected .tt-modal-quick-toggle button');

			expect(toggleBtn.hasClass('tt-chip-active')).toBe(false);
			expect(toggleBtn.textContent).toBe('Quick create off');

			const labelsLabel = findButtonByText(contentEl, 'Labels');
			const labelsField = labelsLabel?.closest('.tt-modal-field');
			expect(labelsField?.hasClass('tt-hidden')).toBe(false);
		});
});
