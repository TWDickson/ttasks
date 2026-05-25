import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import type { ExternalTask } from '../integration/types';
import { ImportConfirmModal } from './ImportConfirmModal';

class FakeElement {
	tag: string;
	textContent = '';
	children: FakeElement[] = [];
	listeners = new Map<string, Array<() => void | Promise<void>>>();

	constructor(tag: string) {
		this.tag = tag;
	}

	createEl(tag: string, options?: { text?: string; cls?: string }): FakeElement {
		const child = new FakeElement(tag);
		if (options?.text) child.textContent = options.text;
		this.children.push(child);
		return child;
	}

	createDiv(options?: { cls?: string }): FakeElement {
		return this.createEl('div', options);
	}

	addEventListener(type: string, handler: () => void | Promise<void>): void {
		const handlers = this.listeners.get(type) ?? [];
		handlers.push(handler);
		this.listeners.set(type, handlers);
	}

	async trigger(type: string): Promise<void> {
		for (const handler of this.listeners.get(type) ?? []) {
			await handler();
		}
	}

	empty(): void {
		this.children = [];
		this.textContent = '';
	}

	allText(): string {
		return [this.textContent, ...this.children.map((child) => child.allText())].join(' ');
	}

	findByText(text: string): FakeElement | null {
		if (this.textContent === text) return this;
		for (const child of this.children) {
			const found = child.findByText(text);
			if (found) return found;
		}
		return null;
	}
}

function buildTask(name: string, filePath: string): ExternalTask {
	return {
		id: `${name}-id`,
		slug: name,
		path: `${filePath}#L1`,
		type: 'task',
		name,
		area: null,
		status: 'Active',
		priority: 'None',
		labels: [],
		parent_task: null,
		depends_on: [],
		blocks: [],
		blocked_reason: '',
		assigned_to: '',
		source: filePath,
		start_date: null,
		due_date: null,
		due_time: null,
		estimated_days: null,
		created: null,
		completed: null,
		status_changed: null,
		recurrence: null,
		recurrence_type: null,
		notes: '',
		is_complete: false,
		is_inbox: true,
		external: true,
		source_type: 'captured-checkbox',
		location: { filePath, line: 1 },
		fromPreviousDay: false,
	};
}

describe('ImportConfirmModal', () => {
	it('displays correct task and file counts', () => {
		const modal = new ImportConfirmModal(new App(), [
			buildTask('A', 'Daily/one.md'),
			buildTask('B', 'Daily/one.md'),
			buildTask('C', 'Daily/two.md'),
		]) as any;
		const content = new FakeElement('div');
		modal.contentEl = content;

		modal.onOpen();
		expect(content.allText()).toContain('Found 3 tasks across 2 files.');
	});

	it('shows first five preview task names with source files', () => {
		const modal = new ImportConfirmModal(new App(), [
			buildTask('A', 'Daily/one.md'),
			buildTask('B', 'Daily/two.md'),
			buildTask('C', 'Daily/three.md'),
			buildTask('D', 'Daily/four.md'),
			buildTask('E', 'Daily/five.md'),
			buildTask('F', 'Daily/six.md'),
		]) as any;
		const content = new FakeElement('div');
		modal.contentEl = content;

		modal.onOpen();
		expect(content.allText()).toContain('A (one.md)');
		expect(content.allText()).toContain('E (five.md)');
		expect(content.allText()).not.toContain('F (six.md)');
	});

	it('resolves true when Import is clicked', async () => {
		const modal = new ImportConfirmModal(new App(), [buildTask('A', 'Daily/one.md')]) as any;
		const content = new FakeElement('div');
		modal.contentEl = content;
		modal.close = vi.fn();

		const resultPromise = modal.openAndWait();
		modal.onOpen();
		await content.findByText('Import 1 tasks')?.trigger('click');

		expect(await resultPromise).toBe(true);
	});

	it('resolves false when Cancel is clicked', async () => {
		const modal = new ImportConfirmModal(new App(), [buildTask('A', 'Daily/one.md')]) as any;
		const content = new FakeElement('div');
		modal.contentEl = content;
		modal.close = vi.fn();

		const resultPromise = modal.openAndWait();
		modal.onOpen();
		await content.findByText('Cancel')?.trigger('click');

		expect(await resultPromise).toBe(false);
	});
});
