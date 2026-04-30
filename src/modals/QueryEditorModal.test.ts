import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import type { QuerySpec } from '../query/types';
import { QueryEditorModal } from './QueryEditorModal';

class FakeElement {
	tag: string;
	textContent = '';
	children: FakeElement[] = [];
	style: Record<string, string> = {};
	value = '';
	rows = 0;
	innerHTML = '';
	classNames = new Set<string>();
	listeners = new Map<string, Array<() => void | Promise<void>>>();

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
		if (options?.text) child.textContent = options.text;
		this.children.push(child);
		return child;
	}

	createDiv(options?: { cls?: string }): FakeElement {
		return this.createEl('div', { cls: options?.cls });
	}

	createSpan(options?: { text?: string; cls?: string }): FakeElement {
		return this.createEl('span', { text: options?.text, cls: options?.cls });
	}

	addEventListener(type: string, handler: () => void | Promise<void>): void {
		const existing = this.listeners.get(type) ?? [];
		existing.push(handler);
		this.listeners.set(type, existing);
	}

	async trigger(type: string): Promise<void> {
		for (const handler of this.listeners.get(type) ?? []) {
			await handler();
		}
	}

	setText(text: string): void {
		this.textContent = text;
	}

	empty(): void {
		this.children = [];
		this.textContent = '';
	}

	addClass(name: string): void {
		this.classNames.add(name);
	}

	removeClass(name: string): void {
		this.classNames.delete(name);
	}

	hasClass(name: string): boolean {
		return this.classNames.has(name);
	}

	allText(): string {
		return [this.textContent, ...this.children.map((child) => child.allText())].join(' ');
	}

	findByText(text: string): FakeElement | null {
		if (this.textContent === text) return this;
		for (const child of this.children) {
			const match = child.findByText(text);
			if (match) return match;
		}
		return null;
	}

	findByTag(tag: string): FakeElement | null {
		if (this.tag === tag) return this;
		for (const child of this.children) {
			const match = child.findByTag(tag);
			if (match) return match;
		}
		return null;
	}
}

const BASE_QUERY: QuerySpec = {
	filter: { logic: 'and', conditions: [] },
	sort: [],
	group: { kind: 'none' },
};

function createModal(renderer: 'list' | 'kanban' | 'agenda' | 'graph' = 'list'): QueryEditorModal {
	return new QueryEditorModal(
		new App(),
		'Test View',
		BASE_QUERY,
		renderer,
		{ statuses: ['Active', 'Blocked'], areas: ['Work'], labelValues: ['bug'] },
		vi.fn(),
	);
}

describe('QueryEditorModal JSON tab', () => {
	it('formats renderer-specific group errors with a repair hint', () => {
		const modal = createModal('agenda') as any;
		const formatted = modal.formatJsonError("Invalid QuerySpec: group must be { kind: 'date_buckets', field: 'due_date', preset: 'agenda' }");

		expect(formatted.summary).toBe('Choose a valid grouping for this renderer.');
		expect(formatted.path).toBe('group');
		expect(formatted.detail).toBe('Agenda views require agenda date buckets.');
		expect(formatted.hint).toContain('Repair For Agenda');
	});

	it('shows structured error state for invalid JSON query content', () => {
		const modal = createModal('list') as any;
		const container = new FakeElement('div');

		modal.renderJsonTab(container);

		const textarea = container.findByTag('textarea');
		const formatButton = container.findByText('Format JSON');
		expect(textarea).not.toBeNull();
		expect(formatButton).not.toBeNull();

		textarea!.value = JSON.stringify({
			filter: {
				logic: 'and',
				conditions: [{ field: 'is_complete', operator: 'contains', value: 'true' }],
			},
			sort: [],
			group: { kind: 'none' },
		});
		void formatButton!.trigger('click');

		expect(textarea!.hasClass('is-invalid')).toBe(true);
		expect(container.allText()).toContain('This operator does not work with the selected field.');
		expect(container.allText()).toContain('Fix this field: filter.conditions[0].operator');
	});

	it('repairs agenda JSON to required agenda grouping', () => {
		const modal = createModal('agenda') as any;
		const container = new FakeElement('div');

		modal.renderJsonTab(container);

		const textarea = container.findByTag('textarea');
		const repairButton = container.findByText('Repair For Agenda');
		expect(textarea).not.toBeNull();
		expect(repairButton).not.toBeNull();

		textarea!.value = JSON.stringify({
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'field', field: 'status' },
		}, null, 2);

		void repairButton!.trigger('click');

		const repaired = JSON.parse(textarea!.value) as QuerySpec;
		expect(repaired.group).toEqual({ kind: 'date_buckets', field: 'due_date', preset: 'agenda' });
		expect(textarea!.hasClass('is-invalid')).toBe(false);
	});

	it('coerces grouping when renderer changes in builder logic', () => {
		const modal = createModal('list') as any;
		modal.query = {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'none' },
		};

		modal.applyRenderer('kanban', false);
		expect(modal.query.group).toEqual({ kind: 'field', field: 'status' });

		modal.query = {
			filter: { logic: 'and', conditions: [] },
			sort: [],
			group: { kind: 'field', field: 'status' },
		};
		modal.applyRenderer('agenda', false);
		expect(modal.query.group).toEqual({ kind: 'date_buckets', field: 'due_date', preset: 'agenda' });
	});

	it('requires explicit confirmation before deleting and then calls onDelete', async () => {
		const onDelete = vi.fn().mockResolvedValue(undefined);
		const modal = new QueryEditorModal(
			new App(),
			'Test View',
			BASE_QUERY,
			'list',
			{ statuses: ['Active'], areas: ['Work'], labelValues: ['bug'] },
			vi.fn(),
			onDelete,
		) as any;
		const content = new FakeElement('div');
		modal.contentEl = content;
		modal.close = vi.fn();
		modal.renderBuilder = () => {};

		modal.render();
		expect(content.findByText('Delete this Smart List?')).toBeNull();

		const deleteBtn = content.findByText('Delete');
		expect(deleteBtn).not.toBeNull();
		await deleteBtn!.trigger('click');

		expect(content.findByText('Delete this Smart List?')).not.toBeNull();
		expect(onDelete).not.toHaveBeenCalled();

		const confirmBtn = content.findByText('Yes, delete');
		expect(confirmBtn).not.toBeNull();
		await confirmBtn!.trigger('click');

		expect(onDelete).toHaveBeenCalledTimes(1);
		expect(modal.close).toHaveBeenCalledTimes(1);
	});
});