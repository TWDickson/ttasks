import { adaptFieldForDetail, type FieldComponentProps } from '../schema/fieldAdapters';
import { getFieldByName } from '../schema/taskFields';
import type { TaskSettings } from '../schema/types';
import type { Task, TaskPriority, TaskStatus } from '../types';
import type { RepeatRule } from '../repeat/types';

export interface TaskDetailEditableValues {
	name: string;
	status: TaskStatus;
	priority: TaskPriority;
	area: string;
	labels: string[];
	parent_task_path: string;
	due_date: string;
	due_time: string;
	start_date: string;
	assigned_to: string;
	estimated_days: number | null;
	blocked_reason: string;
	repeat: RepeatRule | null;
}

export interface TaskDetailFieldPropsInput {
	task: Task | null;
	allTasks: Task[];
	settings: TaskSettings;
	values: TaskDetailEditableValues;
	blockStatus: string;
}

export interface TaskDetailFieldPropsState {
	nameFieldProps: FieldComponentProps | null;
	statusFieldProps: FieldComponentProps | null;
	priorityFieldProps: FieldComponentProps | null;
	parentTaskFieldProps: FieldComponentProps | null;
	repeatFieldProps: FieldComponentProps | null;
	reminderOverrideFieldProps: FieldComponentProps | null;
	estimatedDaysFieldProps: FieldComponentProps | null;
	areaFieldProps: FieldComponentProps | null;
	labelsFieldProps: FieldComponentProps | null;
	dueDateFieldProps: FieldComponentProps | null;
	dueTimeFieldProps: FieldComponentProps | null;
	startDateFieldProps: FieldComponentProps | null;
	assignedToFieldProps: FieldComponentProps | null;
	blockedReasonFieldProps: FieldComponentProps | null;
}

const EMPTY_FIELD_PROPS: TaskDetailFieldPropsState = {
	nameFieldProps: null,
	statusFieldProps: null,
	priorityFieldProps: null,
	parentTaskFieldProps: null,
	repeatFieldProps: null,
	reminderOverrideFieldProps: null,
	estimatedDaysFieldProps: null,
	areaFieldProps: null,
	labelsFieldProps: null,
	dueDateFieldProps: null,
	dueTimeFieldProps: null,
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
			due_time: values.due_time,
			start_date: values.start_date,
			assigned_to: values.assigned_to,
			estimated_days: values.estimated_days,
			blocked_reason: values.blocked_reason,
			repeat: values.repeat,
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
			ariaLabel: props.definition.label,
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
			ariaLabel: 'Task name',
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
		repeatFieldProps: deriveInlineFieldProps('repeat', input),
		reminderOverrideFieldProps: deriveInlineFieldProps('reminder_override', input),
		estimatedDaysFieldProps: deriveInlineFieldProps('estimated_days', input),
		areaFieldProps: deriveInlineFieldProps('area', input),
		labelsFieldProps: deriveInlineFieldProps('labels', input),
		dueDateFieldProps: deriveInlineFieldProps('due_date', input),
		dueTimeFieldProps: deriveInlineFieldProps('due_time', input),
		startDateFieldProps: deriveInlineFieldProps('start_date', input),
		assignedToFieldProps: deriveInlineFieldProps('assigned_to', input),
		blockedReasonFieldProps: deriveInlineFieldProps('blocked_reason', input),
	};
}
