import { adaptFieldForDetail, type FieldComponentProps } from '../schema/fieldAdapters';
import { getFieldByName } from '../schema/taskFields';
import type { TTasksSettings } from '../settings/types';
import type { Task, TaskPriority, TaskStatus } from '../types';

export interface TaskDetailEditableValues {
	name: string;
	status: TaskStatus;
	priority: TaskPriority;
	area: string;
	labels: string[];
	parent_task_path: string;
	due_date: string;
	start_date: string;
	assigned_to: string;
	estimated_days: number | null;
	blocked_reason: string;
	recurrence: string | null;
	recurrence_type: string | null;
}

export interface TaskDetailFieldPropsInput {
	task: Task | null;
	allTasks: Task[];
	settings: TTasksSettings;
	values: TaskDetailEditableValues;
	blockStatus: string;
}

export interface TaskDetailFieldPropsState {
	nameFieldProps: FieldComponentProps | null;
	statusFieldProps: FieldComponentProps | null;
	priorityFieldProps: FieldComponentProps | null;
	parentTaskFieldProps: FieldComponentProps | null;
	recurrenceFieldProps: FieldComponentProps | null;
	recurrenceTypeFieldProps: FieldComponentProps | null;
	reminderOverrideFieldProps: FieldComponentProps | null;
	estimatedDaysFieldProps: FieldComponentProps | null;
	areaFieldProps: FieldComponentProps | null;
	labelsFieldProps: FieldComponentProps | null;
	dueDateFieldProps: FieldComponentProps | null;
	startDateFieldProps: FieldComponentProps | null;
	assignedToFieldProps: FieldComponentProps | null;
	blockedReasonFieldProps: FieldComponentProps | null;
}

const EMPTY_FIELD_PROPS: TaskDetailFieldPropsState = {
	nameFieldProps: null,
	statusFieldProps: null,
	priorityFieldProps: null,
	parentTaskFieldProps: null,
	recurrenceFieldProps: null,
	recurrenceTypeFieldProps: null,
	reminderOverrideFieldProps: null,
	estimatedDaysFieldProps: null,
	areaFieldProps: null,
	labelsFieldProps: null,
	dueDateFieldProps: null,
	startDateFieldProps: null,
	assignedToFieldProps: null,
	blockedReasonFieldProps: null,
};

function deriveInlineFieldProps(
	fieldName: keyof Task,
	input: TaskDetailFieldPropsInput
): FieldComponentProps | null {
	const field = getFieldByName(fieldName);
	if (!field) return null;

	const { task, allTasks, settings, values, blockStatus } = input;
	const props = adaptFieldForDetail(
		field,
		{
			...(task ?? {}),
			name: values.name,
			status: values.status,
			priority: values.priority,
			area: values.area,
			labels: values.labels,
			parent_task: values.parent_task_path || null,
			due_date: values.due_date,
			start_date: values.start_date,
			assigned_to: values.assigned_to,
			estimated_days: values.estimated_days,
			blocked_reason: values.blocked_reason,
			recurrence: values.recurrence,
			recurrence_type: values.recurrence_type,
			blockStatus,
		},
		allTasks,
		settings,
		{}
	);

	return {
		...props,
		definition: {
			...props.definition,
			label: '',
		},
	};
}

function deriveHeaderFieldProps(
	fieldName: keyof Task,
	input: TaskDetailFieldPropsInput
): FieldComponentProps | null {
	const props = deriveInlineFieldProps(fieldName, input);
	if (!props) return null;

	return {
		...props,
		definition: {
			...props.definition,
			label: '',
			placeholder: 'Task name',
		},
	};
}

export function deriveTaskDetailFieldProps(input: TaskDetailFieldPropsInput): TaskDetailFieldPropsState {
	if (!input.task) return EMPTY_FIELD_PROPS;

	return {
		nameFieldProps: deriveHeaderFieldProps('name', input),
		statusFieldProps: deriveInlineFieldProps('status', input),
		priorityFieldProps: deriveInlineFieldProps('priority', input),
		parentTaskFieldProps: deriveInlineFieldProps('parent_task', input),
		recurrenceFieldProps: deriveInlineFieldProps('recurrence', input),
		recurrenceTypeFieldProps: deriveInlineFieldProps('recurrence_type', input),
		reminderOverrideFieldProps: deriveInlineFieldProps('reminder_override', input),
		estimatedDaysFieldProps: deriveInlineFieldProps('estimated_days', input),
		areaFieldProps: deriveInlineFieldProps('area', input),
		labelsFieldProps: deriveInlineFieldProps('labels', input),
		dueDateFieldProps: deriveInlineFieldProps('due_date', input),
		startDateFieldProps: deriveInlineFieldProps('start_date', input),
		assignedToFieldProps: deriveInlineFieldProps('assigned_to', input),
		blockedReasonFieldProps: deriveInlineFieldProps('blocked_reason', input),
	};
}
