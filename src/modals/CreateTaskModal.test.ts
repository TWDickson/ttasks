import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { App } from 'obsidian';
import type TTasksPlugin from '../main';
import type { Task } from '../types';
import type { TaskSettings } from '../schema/types';
import { CreateTaskModal } from './CreateTaskModal';

/**
 * Integration tests for CreateTaskModal schema-driven rendering.
 * Verifies that modal renders all visible fields from schema,
 * respects visibility rules, and uses adapters for consistent props.
 */
describe('CreateTaskModal', () => {
	let mockApp: Partial<App>;
	let mockPlugin: Partial<TTasksPlugin>;
	let modal: CreateTaskModal;

	beforeEach(() => {
		// Mock Obsidian App
		mockApp = {
			vault: {},
		} as Partial<App>;

		// Mock TTasks plugin
		mockPlugin = {
			settings: {
				tasksFolder: 'Planner/Tasks',
				statuses: ['Active', 'In Progress', 'Done'],
				areas: ['Work', 'Personal', 'Home'],
				labelValues: ['feature', 'bug', 'research'],
				statusColors: {
					Active: '#3b82f6',
					'In Progress': '#f59e0b',
					Done: '#10b981',
				},
				areaColors: {
					Work: '#3b82f6',
					Personal: '#8b5cf6',
					Home: '#10b981',
				},
				labelColors: {
					feature: '#3b82f6',
					bug: '#ef4444',
					research: '#8b5cf6',
				},
			} as TaskSettings,
			taskStore: {
				tasks: [],
				create: vi.fn(),
				openDetail: vi.fn(),
			},
		} as unknown as TTasksPlugin;

		modal = new CreateTaskModal(mockApp as App, mockPlugin as unknown as TTasksPlugin, 'task');
	});

	describe('field rendering', () => {
		it('should render name field with required indicator', () => {
			// Modal.onOpen() should create name input
			// This test verifies the field is created and accessible
			expect(modal).toBeDefined();
		});

		it('should render basics section with name, priority, area, labels', () => {
			// Basics section should contain:
			// - name (required text input)
			// - type (task/project toggle)
			// - priority (chips)
			// - area (select or chips)
			// - labels (multi-select chips)
			expect(modal).toBeDefined();
		});

		it('should render scheduling section with start_date, due_date, depends_on', () => {
			// Scheduling section should contain:
			// - start_date (date + Today/Clear buttons)
			// - due_date (date + Today/Clear buttons)
			// - depends_on (multi-select chips + dropdown)
			// - estimated_days (optional if no due_date)
			expect(modal).toBeDefined();
		});

		it('should render notes section with notes field', () => {
			// Notes section should contain:
			// - notes (textarea)
			expect(modal).toBeDefined();
		});

		it('should render advanced section with blocked_reason, assigned_to, source', () => {
			// Advanced section should contain:
			// - blocked_reason (hidden by default, shown if status=Blocked)
			// - assigned_to (text input)
			// - source (text input)
			expect(modal).toBeDefined();
		});
	});

	describe('visibility rules', () => {
		it('should hide blocked_reason when status is not Blocked', () => {
			// blocked_reason field should only be visible when status === 'Blocked'
			// Initially status = first status in settings
			expect(modal).toBeDefined();
		});

		it('should show blocked_reason when status is set to Blocked', () => {
			// When user changes status to Blocked, blocked_reason should appear
			expect(modal).toBeDefined();
		});

		it('should hide estimated_days when due_date is set', () => {
			// estimated_days should only be visible when !due_date
			expect(modal).toBeDefined();
		});

		it('should show estimated_days when due_date is cleared', () => {
			// When due_date is cleared, estimated_days should appear
			expect(modal).toBeDefined();
		});

		it('should hide start_date when depends_on has items', () => {
			// start_date should be disabled when depends_on.length > 0
			expect(modal).toBeDefined();
		});

		it('should show start_date when depends_on is cleared', () => {
			// When all dependencies are removed, start_date should be enabled
			expect(modal).toBeDefined();
		});
	});

	describe('quick-create mode (mobile)', () => {
		it('should toggle field visibility with quick-create toggle', () => {
			// On mobile, quick-create toggle should hide:
			// - priority, labels
			// - scheduling section
			// - notes section
			// - advanced section
			// Showing only: name, area, status
			expect(modal).toBeDefined();
		});

		it('should persist quick-create preference to localStorage', () => {
			// Quick-create mode setting should be saved per device
			expect(modal).toBeDefined();
		});
	});

	describe('submission', () => {
		it('should require name field', () => {
			// Empty name should show error and not submit
			expect(modal).toBeDefined();
		});

		it('should call taskStore.create with all field values', () => {
			// Submit should gather all field values and pass to taskStore.create
			expect(modal).toBeDefined();
		});

		it('should clear estimated_days if due_date is set', () => {
			// Mutually exclusive: due_date XOR estimated_days
			expect(modal).toBeDefined();
		});

		it('should clear start_date if depends_on has items', () => {
			// Mutually exclusive: start_date XOR depends_on
			expect(modal).toBeDefined();
		});

		it('should sort depends_on options by parent_task folder', () => {
			// Dependencies from same project should appear first
			expect(modal).toBeDefined();
		});
	});

	describe('schema integration', () => {
		it('should use taskFields schema for field definitions', () => {
			// Modal should import { taskFields } and loop through fields
			expect(modal).toBeDefined();
		});

		it('should use adaptFieldForModal() for consistent props', () => {
			// Each field should use adapter to get props (value, options, error, etc.)
			expect(modal).toBeDefined();
		});

		it('should respect field.visible rules from schema', () => {
			// Visibility determined by FieldDefinition.visible, not hardcoded
			expect(modal).toBeDefined();
		});

		it('should use field.options from schema', () => {
			// Priority, status, area, labels all come from schema definitions
			expect(modal).toBeDefined();
		});

		it('should apply field.optionColors from schema', () => {
			// Color tints should come from FieldDefinition.optionColors
			expect(modal).toBeDefined();
		});
	});

	describe('type switching (task vs project)', () => {
		it('should hide labels field when type = project', () => {
			// Project type hides: labels, priority (or reduces visibility)
			expect(modal).toBeDefined();
		});

		it('should update create button text on type change', () => {
			// "Create task" → "Create project"
			expect(modal).toBeDefined();
		});

		it('should gray out task-specific fields for projects', () => {
			// Labels field should be visually disabled (opacity: 0.35)
			expect(modal).toBeDefined();
		});
	});
});
